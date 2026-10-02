//! Bounded parsing of selection HTML into a flat arena.
//!
//! html5ever's spec-compliant tree builder feeds a minimal sink. Nodes live in
//! one `Vec` addressed by index, so nothing recurses and dropping the tree is
//! flat. The sink keeps only the attributes the Markdown writer reads and
//! ignores comments, doctypes, and template contents. Input arrives in small
//! chunks; after each one the parse is abandoned once the node budget, the
//! nesting bound, or the deadline is exceeded, so neither memory nor the tree
//! builder's scope scans (linear in nesting depth) can run away.

use std::borrow::Cow;
use std::cell::{Cell, Ref, RefCell};
use std::rc::Rc;
use std::time::Instant;

use html5ever::interface::tree_builder::{ElementFlags, NodeOrText, QuirksMode, TreeSink};
use html5ever::tendril::{StrTendril, TendrilSink};
use html5ever::{local_name, ns, parse_document, Attribute, LocalName, ParseOpts, QualName};

pub(super) type NodeId = usize;

/// The document root.
pub(super) const DOCUMENT: NodeId = 0;
/// Comments, processing instructions, and template contents: never rendered.
const IGNORED: NodeId = 1;

/// Bytes handed to the parser between bound checks: at most about a thousand
/// tags can exceed a bound before the parse is abandoned.
const CHUNK_BYTES: usize = 4 * 1024;

/// The only attributes the writer reads; everything else is never stored.
const KEPT_ATTRIBUTES: &[&str] = &[
    "alt", "colspan", "hidden", "href", "rowspan", "start", "style",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Kind {
    Document,
    Element,
    Text,
    Ignored,
}

pub(super) struct Node {
    pub(super) parent: Option<NodeId>,
    pub(super) first_child: Option<NodeId>,
    last_child: Option<NodeId>,
    previous_sibling: Option<NodeId>,
    pub(super) next_sibling: Option<NodeId>,
    pub(super) kind: Kind,
    pub(super) name: QualName,
    pub(super) text: StrTendril,
    attributes: Vec<Attribute>,
    /// Nesting depth when last inserted; descendants of a moved node keep
    /// their previous value, which is close enough to bound the parse.
    depth: usize,
}

impl Node {
    fn new(kind: Kind, name: QualName) -> Self {
        Self {
            parent: None,
            first_child: None,
            last_child: None,
            previous_sibling: None,
            next_sibling: None,
            kind,
            name,
            text: StrTendril::new(),
            attributes: Vec::new(),
            depth: 0,
        }
    }
}

pub(super) struct Dom {
    pub(super) nodes: Vec<Node>,
}

impl Dom {
    pub(super) fn children(&self, id: NodeId) -> Children<'_> {
        Children {
            dom: self,
            next: self.nodes[id].first_child,
        }
    }

    pub(super) fn attribute(&self, id: NodeId, name: &str) -> Option<&str> {
        self.nodes[id]
            .attributes
            .iter()
            .find(|attribute| &*attribute.name.local == name)
            .map(|attribute| &*attribute.value)
    }

    /// The local name of an HTML element; `None` for text, other namespaces
    /// (inside `svg` or `math`), and ignored nodes.
    pub(super) fn html_name(&self, id: NodeId) -> Option<&LocalName> {
        let node = &self.nodes[id];
        (node.kind == Kind::Element && node.name.ns == ns!(html)).then_some(&node.name.local)
    }
}

pub(super) struct Children<'a> {
    dom: &'a Dom,
    next: Option<NodeId>,
}

impl Iterator for Children<'_> {
    type Item = NodeId;

    fn next(&mut self) -> Option<NodeId> {
        let current = self.next?;
        self.next = self.dom.nodes[current].next_sibling;
        Some(current)
    }
}

/// Parses `html` into an arena of at most `budget` nodes nested at most
/// `max_depth` deep, or `None` when a bound or the deadline is exceeded.
pub(super) fn parse(html: &str, budget: usize, max_depth: usize, deadline: Instant) -> Option<Dom> {
    let exceeded = Rc::new(Cell::new(false));
    let sink = Sink {
        nodes: RefCell::new(vec![
            Node::new(Kind::Document, QualName::new(None, ns!(), local_name!(""))),
            Node::new(Kind::Ignored, QualName::new(None, ns!(), local_name!(""))),
        ]),
        // The two fixed nodes do not count against the budget.
        max_nodes: budget.saturating_add(2),
        max_depth,
        exceeded: Rc::clone(&exceeded),
    };
    let mut parser = parse_document(sink, ParseOpts::default());
    let mut start = 0;
    while start < html.len() {
        let mut end = (start + CHUNK_BYTES).min(html.len());
        while !html.is_char_boundary(end) {
            end -= 1;
        }
        parser.process(StrTendril::from_slice(&html[start..end]));
        if exceeded.get() || Instant::now() >= deadline {
            return None;
        }
        start = end;
    }
    let dom = parser.finish();
    (!exceeded.get() && Instant::now() < deadline).then_some(dom)
}

struct Sink {
    nodes: RefCell<Vec<Node>>,
    max_nodes: usize,
    max_depth: usize,
    exceeded: Rc<Cell<bool>>,
}

impl Sink {
    fn inert(id: NodeId) -> bool {
        id == IGNORED
    }

    /// Always allocates, so the tree builder keeps a consistent tree until the
    /// parse is abandoned at the end of the current chunk.
    fn allocate(&self, node: Node) -> NodeId {
        let mut nodes = self.nodes.borrow_mut();
        nodes.push(node);
        if nodes.len() > self.max_nodes {
            self.exceeded.set(true);
        }
        nodes.len() - 1
    }

    fn placed(&self, nodes: &mut [Node], child: NodeId, depth: usize) {
        nodes[child].depth = depth;
        if depth > self.max_depth {
            self.exceeded.set(true);
        }
    }

    fn insert_text(&self, previous: Option<NodeId>, text: &StrTendril) -> Option<NodeId> {
        if let Some(previous) = previous {
            let mut nodes = self.nodes.borrow_mut();
            if nodes[previous].kind == Kind::Text {
                nodes[previous].text.push_tendril(text);
                return None;
            }
        }
        let mut node = Node::new(Kind::Text, QualName::new(None, ns!(), local_name!("")));
        node.text = text.clone();
        Some(self.allocate(node))
    }

    fn detach(nodes: &mut [Node], id: NodeId) {
        let parent = nodes[id].parent.take();
        let previous = nodes[id].previous_sibling.take();
        let next = nodes[id].next_sibling.take();
        match next {
            Some(next) => nodes[next].previous_sibling = previous,
            None => {
                if let Some(parent) = parent {
                    nodes[parent].last_child = previous;
                }
            }
        }
        match previous {
            Some(previous) => nodes[previous].next_sibling = next,
            None => {
                if let Some(parent) = parent {
                    nodes[parent].first_child = next;
                }
            }
        }
    }

    fn append_child(&self, nodes: &mut [Node], parent: NodeId, child: NodeId) {
        Self::detach(nodes, child);
        self.placed(nodes, child, nodes[parent].depth + 1);
        nodes[child].parent = Some(parent);
        match nodes[parent].last_child {
            Some(last) => {
                nodes[child].previous_sibling = Some(last);
                nodes[last].next_sibling = Some(child);
            }
            None => nodes[parent].first_child = Some(child),
        }
        nodes[parent].last_child = Some(child);
    }

    fn insert_before(&self, nodes: &mut [Node], sibling: NodeId, child: NodeId) {
        Self::detach(nodes, child);
        self.placed(nodes, child, nodes[sibling].depth);
        let parent = nodes[sibling].parent;
        nodes[child].parent = parent;
        nodes[child].next_sibling = Some(sibling);
        match nodes[sibling].previous_sibling {
            Some(previous) => {
                nodes[child].previous_sibling = Some(previous);
                nodes[previous].next_sibling = Some(child);
            }
            None => {
                if let Some(parent) = parent {
                    nodes[parent].first_child = Some(child);
                }
            }
        }
        nodes[sibling].previous_sibling = Some(child);
    }

    fn kept(attributes: Vec<Attribute>) -> Vec<Attribute> {
        attributes
            .into_iter()
            .filter(|attribute| KEPT_ATTRIBUTES.contains(&&*attribute.name.local))
            .collect()
    }
}

impl TreeSink for Sink {
    type Handle = NodeId;
    type Output = Dom;
    type ElemName<'a>
        = Ref<'a, QualName>
    where
        Self: 'a;

    fn finish(self) -> Dom {
        Dom {
            nodes: self.nodes.into_inner(),
        }
    }

    // Parse errors are expected in clipboard fragments and carry no content;
    // they are neither stored nor logged.
    fn parse_error(&self, _message: Cow<'static, str>) {}

    fn get_document(&self) -> NodeId {
        DOCUMENT
    }

    fn elem_name<'a>(&'a self, target: &'a NodeId) -> Ref<'a, QualName> {
        Ref::map(self.nodes.borrow(), |nodes| &nodes[*target].name)
    }

    fn create_element(
        &self,
        name: QualName,
        attributes: Vec<Attribute>,
        _: ElementFlags,
    ) -> NodeId {
        let mut node = Node::new(Kind::Element, name);
        node.attributes = Self::kept(attributes);
        self.allocate(node)
    }

    fn create_comment(&self, _text: StrTendril) -> NodeId {
        IGNORED
    }

    fn create_pi(&self, _target: StrTendril, _data: StrTendril) -> NodeId {
        IGNORED
    }

    fn append(&self, parent: &NodeId, child: NodeOrText<NodeId>) {
        if Self::inert(*parent) {
            return;
        }
        let child = match child {
            NodeOrText::AppendNode(child) if Self::inert(child) => return,
            NodeOrText::AppendNode(child) => child,
            NodeOrText::AppendText(text) => {
                let last = self.nodes.borrow()[*parent].last_child;
                match self.insert_text(last, &text) {
                    Some(child) => child,
                    None => return,
                }
            }
        };
        self.append_child(&mut self.nodes.borrow_mut(), *parent, child);
    }

    fn append_based_on_parent_node(
        &self,
        element: &NodeId,
        previous_element: &NodeId,
        child: NodeOrText<NodeId>,
    ) {
        let has_parent = self.nodes.borrow()[*element].parent.is_some();
        if has_parent {
            self.append_before_sibling(element, child);
        } else {
            self.append(previous_element, child);
        }
    }

    fn append_doctype_to_document(&self, _: StrTendril, _: StrTendril, _: StrTendril) {}

    fn get_template_contents(&self, _target: &NodeId) -> NodeId {
        // Template contents are never rendered.
        IGNORED
    }

    fn same_node(&self, x: &NodeId, y: &NodeId) -> bool {
        x == y
    }

    fn set_quirks_mode(&self, _mode: QuirksMode) {}

    fn append_before_sibling(&self, sibling: &NodeId, child: NodeOrText<NodeId>) {
        if Self::inert(*sibling) {
            return;
        }
        let child = match child {
            NodeOrText::AppendNode(child) if Self::inert(child) => return,
            NodeOrText::AppendNode(child) => child,
            NodeOrText::AppendText(text) => {
                let previous = self.nodes.borrow()[*sibling].previous_sibling;
                match self.insert_text(previous, &text) {
                    Some(child) => child,
                    None => return,
                }
            }
        };
        self.insert_before(&mut self.nodes.borrow_mut(), *sibling, child);
    }

    fn add_attrs_if_missing(&self, target: &NodeId, attributes: Vec<Attribute>) {
        if Self::inert(*target) {
            return;
        }
        let mut nodes = self.nodes.borrow_mut();
        let existing = &mut nodes[*target].attributes;
        for attribute in Self::kept(attributes) {
            if !existing
                .iter()
                .any(|current| current.name == attribute.name)
            {
                existing.push(attribute);
            }
        }
    }

    fn remove_from_parent(&self, target: &NodeId) {
        if !Self::inert(*target) {
            Self::detach(&mut self.nodes.borrow_mut(), *target);
        }
    }

    fn reparent_children(&self, node: &NodeId, new_parent: &NodeId) {
        if Self::inert(*node) || Self::inert(*new_parent) {
            return;
        }
        let mut nodes = self.nodes.borrow_mut();
        let mut next = nodes[*node].first_child;
        while let Some(child) = next {
            next = nodes[child].next_sibling;
            self.append_child(&mut nodes, *new_parent, child);
        }
    }
}
