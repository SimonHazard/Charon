//! Deterministic Markdown rendering of a parsed selection, with parity.
//!
//! The renderer walks the arena with an explicit stack and writes every
//! character either as content (text the user selected) or as syntax
//! (markers, escapes, prefixes, link destinations). Each content letter or
//! digit is compared, lowercased, with the next one of the plain text, and the
//! boundary before it (joined, spaced, or a line break) must match too. Any
//! difference, an unsupported shape, or a bound aborts the whole rendering.

use std::time::Instant;

use html5ever::{local_name, LocalName};

use super::dom::{Dom, Kind, NodeId, DOCUMENT};
use super::Limits;

/// The render was abandoned; the caller keeps the plain text.
#[derive(Debug)]
pub(super) struct Abort;

type Step = Result<(), Abort>;

/// Steps between deadline checks.
const DEADLINE_STRIDE: usize = 256;
/// Longest link destination kept; longer links keep their text only.
const MAX_DESTINATION_BYTES: usize = 2048;
/// CommonMark allows at most nine digits in an ordered list marker.
const MAX_LIST_NUMBER: u64 = 999_999_999;

const HAS_BLOCK: u8 = 1;
const HAS_BREAK: u8 = 2;

pub(super) fn render(dom: &Dom, plain: &str, limits: &Limits, deadline: Instant) -> Option<String> {
    let flags = layout_flags(dom, limits.depth, deadline).ok()?;
    let mut renderer = Renderer {
        dom,
        flags,
        writer: Writer::new(plain, limits.markdown_bytes),
        lists: Vec::new(),
        inline: Vec::new(),
        deadline,
    };
    renderer.run().ok()?;
    renderer.writer.finish()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Role {
    /// Not rendered, with everything inside it.
    Drop,
    /// Rendered through its children only.
    Transparent,
    Block,
    Heading(u8),
    List {
        ordered: bool,
    },
    Item,
    Quote,
    Preformatted,
    Code,
    Strong,
    Emphasis,
    Strike,
    Link,
    Break,
    Rule,
    Table,
    Image,
}

fn role(dom: &Dom, id: NodeId) -> Role {
    let node = &dom.nodes[id];
    if node.kind != Kind::Element {
        return Role::Transparent;
    }
    // Foreign content is dropped at its `svg` or `math` root; anything else
    // outside the HTML namespace only contributes its text.
    let Some(name) = dom.html_name(id) else {
        return match &*node.name.local {
            "svg" | "math" => Role::Drop,
            _ => Role::Transparent,
        };
    };
    if dom.attribute(id, "hidden").is_some() {
        return Role::Drop;
    }
    match *name {
        local_name!("head")
        | local_name!("title")
        | local_name!("script")
        | local_name!("style")
        | local_name!("template")
        | local_name!("noscript")
        | local_name!("noembed")
        | local_name!("noframes")
        | local_name!("iframe")
        | local_name!("object")
        | local_name!("embed")
        | local_name!("video")
        | local_name!("audio")
        | local_name!("canvas")
        | local_name!("input")
        | local_name!("select")
        | local_name!("option")
        | local_name!("optgroup")
        | local_name!("datalist")
        | local_name!("textarea")
        | local_name!("progress")
        | local_name!("meter") => Role::Drop,
        local_name!("h1") => Role::Heading(1),
        local_name!("h2") => Role::Heading(2),
        local_name!("h3") => Role::Heading(3),
        local_name!("h4") => Role::Heading(4),
        local_name!("h5") => Role::Heading(5),
        local_name!("h6") => Role::Heading(6),
        local_name!("ul") | local_name!("menu") | local_name!("dir") => {
            Role::List { ordered: false }
        }
        local_name!("ol") => Role::List { ordered: true },
        local_name!("li") => Role::Item,
        local_name!("blockquote") => Role::Quote,
        local_name!("pre")
        | local_name!("listing")
        | local_name!("xmp")
        | local_name!("plaintext") => Role::Preformatted,
        local_name!("code") | local_name!("kbd") | local_name!("samp") | local_name!("tt") => {
            Role::Code
        }
        local_name!("strong") | local_name!("b") => Role::Strong,
        local_name!("em") | local_name!("i") => Role::Emphasis,
        local_name!("del") | local_name!("s") | local_name!("strike") => Role::Strike,
        local_name!("a") => Role::Link,
        local_name!("br") => Role::Break,
        local_name!("hr") => Role::Rule,
        local_name!("table") => Role::Table,
        local_name!("img") => Role::Image,
        _ if is_block(name) => Role::Block,
        _ => Role::Transparent,
    }
}

fn is_block(name: &LocalName) -> bool {
    matches!(
        *name,
        local_name!("html")
            | local_name!("body")
            | local_name!("p")
            | local_name!("div")
            | local_name!("section")
            | local_name!("article")
            | local_name!("aside")
            | local_name!("header")
            | local_name!("footer")
            | local_name!("main")
            | local_name!("nav")
            | local_name!("address")
            | local_name!("figure")
            | local_name!("figcaption")
            | local_name!("details")
            | local_name!("summary")
            | local_name!("dialog")
            | local_name!("dl")
            | local_name!("dt")
            | local_name!("dd")
            | local_name!("center")
            | local_name!("form")
            | local_name!("fieldset")
            | local_name!("legend")
            | local_name!("hgroup")
            | local_name!("search")
            | local_name!("caption")
            | local_name!("thead")
            | local_name!("tbody")
            | local_name!("tfoot")
            | local_name!("tr")
            | local_name!("td")
            | local_name!("th")
            | local_name!("colgroup")
            | local_name!("col")
            | local_name!("frameset")
            | local_name!("frame")
    )
}

/// What every element contains, computed bottom-up without recursion:
/// whether a block or a line break lies inside it. Fails beyond the depth
/// bound or the deadline.
fn layout_flags(dom: &Dom, max_depth: usize, deadline: Instant) -> Result<Vec<u8>, Abort> {
    let mut flags = vec![0_u8; dom.nodes.len()];
    let mut order = Vec::new();
    let mut stack = vec![(DOCUMENT, 0_usize)];
    while let Some((id, depth)) = stack.pop() {
        if depth > max_depth {
            return Err(Abort);
        }
        if order.len().is_multiple_of(DEADLINE_STRIDE) && Instant::now() >= deadline {
            return Err(Abort);
        }
        order.push(id);
        if role(dom, id) == Role::Drop {
            continue;
        }
        stack.extend(dom.children(id).map(|child| (child, depth + 1)));
    }
    for &id in order.iter().rev() {
        let Some(parent) = dom.nodes[id].parent else {
            continue;
        };
        let own = match role(dom, id) {
            Role::Drop | Role::Transparent | Role::Strong | Role::Emphasis | Role::Strike => 0,
            Role::Link | Role::Code | Role::Image => 0,
            Role::Break => HAS_BREAK,
            _ => HAS_BLOCK,
        };
        flags[parent] |= own | flags[id];
    }
    Ok(flags)
}

enum Visit {
    Enter(NodeId),
    Exit(Close),
    TableRowStart,
    TableCellStart,
    TableCellEnd,
    TableRowEnd { delimiter_columns: usize },
    TableEnd,
}

#[derive(Clone, Copy)]
enum Close {
    Block,
    List,
    Item,
    Quote,
    Inline,
}

struct ListState {
    ordered: bool,
    next: u64,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum InlineKind {
    Heading,
    Strong,
    Emphasis,
    Strike,
    Link,
}

struct Renderer<'d, 'p> {
    dom: &'d Dom,
    flags: Vec<u8>,
    writer: Writer<'p>,
    lists: Vec<ListState>,
    inline: Vec<InlineKind>,
    deadline: Instant,
}

impl Renderer<'_, '_> {
    fn run(&mut self) -> Step {
        let mut stack = vec![Visit::Enter(DOCUMENT)];
        let mut steps = 0_usize;
        while let Some(visit) = stack.pop() {
            steps += 1;
            if steps.is_multiple_of(DEADLINE_STRIDE) && Instant::now() >= self.deadline {
                return Err(Abort);
            }
            match visit {
                Visit::Enter(id) => self.enter(id, &mut stack)?,
                Visit::Exit(close) => self.exit(close)?,
                Visit::TableRowStart => self.writer.table_row_start()?,
                Visit::TableCellStart => self.writer.table_cell_start()?,
                Visit::TableCellEnd => self.writer.table_cell_end()?,
                Visit::TableRowEnd { delimiter_columns } => {
                    self.writer.table_row_end(delimiter_columns)?
                }
                Visit::TableEnd => self.writer.table_end(),
            }
        }
        Ok(())
    }

    fn push_children(&self, id: NodeId, stack: &mut Vec<Visit>) {
        let start = stack.len();
        stack.extend(self.dom.children(id).map(Visit::Enter));
        stack[start..].reverse();
    }

    fn enter(&mut self, id: NodeId, stack: &mut Vec<Visit>) -> Step {
        let node = &self.dom.nodes[id];
        match node.kind {
            Kind::Text => return self.writer.text(&node.text),
            Kind::Ignored => return Ok(()),
            Kind::Document | Kind::Element => {}
        }
        let flags = self.flags[id];
        match role(self.dom, id) {
            Role::Drop => {}
            Role::Transparent => self.push_children(id, stack),
            Role::Block => self.open_block(id, Close::Block, stack),
            Role::Heading(level) if flags & (HAS_BLOCK | HAS_BREAK) == 0 => {
                self.writer.request_break(Break::Blank);
                let marker = format!("{} ", "#".repeat(usize::from(level)));
                self.open_inline(id, InlineKind::Heading, &marker, "", stack);
            }
            Role::Heading(_) => self.open_block(id, Close::Block, stack),
            Role::List { ordered } => {
                let start = if ordered {
                    self.dom
                        .attribute(id, "start")
                        .and_then(|value| value.trim().parse::<u64>().ok())
                        .unwrap_or(1)
                        .min(MAX_LIST_NUMBER)
                } else {
                    1
                };
                self.writer.request_break(self.list_break());
                self.lists.push(ListState {
                    ordered,
                    next: start,
                });
                stack.push(Visit::Exit(Close::List));
                self.push_children(id, stack);
            }
            Role::Item => {
                let Some(list) = self.lists.last_mut() else {
                    self.open_block(id, Close::Block, stack);
                    return Ok(());
                };
                let marker = if list.ordered {
                    let marker = format!("{}. ", list.next);
                    list.next = (list.next + 1).min(MAX_LIST_NUMBER);
                    marker
                } else {
                    "- ".to_owned()
                };
                self.writer.request_break(Break::Line);
                self.writer.open_container(Container::Item {
                    marker,
                    started: false,
                });
                stack.push(Visit::Exit(Close::Item));
                self.push_children(id, stack);
            }
            Role::Quote => {
                self.writer.request_break(Break::Blank);
                self.writer.open_container(Container::Quote);
                stack.push(Visit::Exit(Close::Quote));
                self.push_children(id, stack);
            }
            Role::Preformatted => {
                let text = self.collect_text(id, true);
                self.writer.request_break(Break::Blank);
                self.writer.code_block(&text)?;
                self.writer.request_break(Break::Blank);
            }
            Role::Code if flags & HAS_BLOCK == 0 => {
                let text = self.collect_text(id, false);
                self.writer.inline_code(&text)?;
            }
            Role::Code => self.push_children(id, stack),
            Role::Strong => {
                self.open_formatting(id, InlineKind::Strong, "**", "font-weight", stack)
            }
            Role::Emphasis => {
                self.open_formatting(id, InlineKind::Emphasis, "*", "font-style", stack)
            }
            Role::Strike => self.open_formatting(id, InlineKind::Strike, "~~", "", stack),
            Role::Link => {
                let destination = self.dom.attribute(id, "href").and_then(safe_destination);
                match destination {
                    Some(destination)
                        if flags & HAS_BLOCK == 0 && !self.inline.contains(&InlineKind::Link) =>
                    {
                        let closing = format!("]({destination})");
                        self.open_inline(id, InlineKind::Link, "[", &closing, stack);
                    }
                    _ => self.push_children(id, stack),
                }
            }
            Role::Break => self.writer.hard_break(),
            Role::Rule => {
                self.writer.request_break(Break::Blank);
                self.writer.rule()?;
                self.writer.request_break(Break::Blank);
            }
            Role::Table => self.enter_table(id, stack)?,
            Role::Image => {
                if let Some(alt) = self.dom.attribute(id, "alt") {
                    self.writer.text(alt)?;
                }
            }
        }
        Ok(())
    }

    fn exit(&mut self, close: Close) -> Step {
        match close {
            Close::Block => self.writer.request_break(Break::Blank),
            Close::List => {
                self.lists.pop();
                // Always a blank line: text after a nested list would otherwise
                // continue the nested item's paragraph.
                self.writer.request_break(Break::Blank);
            }
            Close::Item => {
                self.writer.close_container();
                self.writer.request_break(Break::Line);
            }
            Close::Quote => {
                self.writer.close_container();
                self.writer.request_break(Break::Blank);
            }
            Close::Inline => {
                let kind = self.inline.pop().ok_or(Abort)?;
                self.writer.close_inline()?;
                if kind == InlineKind::Heading {
                    self.writer.heading = false;
                    self.writer.request_break(Break::Blank);
                }
            }
        }
        Ok(())
    }

    /// A list nested in an item stays tight; any other list is its own block.
    fn list_break(&self) -> Break {
        if self.writer.in_item() {
            Break::Line
        } else {
            Break::Blank
        }
    }

    fn open_block(&mut self, id: NodeId, close: Close, stack: &mut Vec<Visit>) {
        self.writer.request_break(Break::Blank);
        stack.push(Visit::Exit(close));
        self.push_children(id, stack);
    }

    fn open_inline(
        &mut self,
        id: NodeId,
        kind: InlineKind,
        marker: &str,
        closing: &str,
        stack: &mut Vec<Visit>,
    ) {
        if kind == InlineKind::Heading {
            self.writer.heading = true;
        }
        self.inline.push(kind);
        self.writer.open_inline(marker, closing);
        stack.push(Visit::Exit(Close::Inline));
        self.push_children(id, stack);
    }

    /// Strong, emphasis, and strike-through become Markdown only around inline
    /// content, once per nesting, and only when no inline style could cancel
    /// the element's usual look (Charon never evaluates CSS).
    fn open_formatting(
        &mut self,
        id: NodeId,
        kind: InlineKind,
        marker: &str,
        cancelling_property: &str,
        stack: &mut Vec<Visit>,
    ) {
        let styled = !cancelling_property.is_empty()
            && self
                .dom
                .attribute(id, "style")
                .is_some_and(|style| style.to_ascii_lowercase().contains(cancelling_property));
        if self.flags[id] & HAS_BLOCK != 0 || styled || self.inline.contains(&kind) {
            self.push_children(id, stack);
        } else {
            self.open_inline(id, kind, marker, marker, stack);
        }
    }

    /// The text of a subtree for code: dropped elements skipped, `<br>` as a
    /// line break when preformatted, a space otherwise.
    fn collect_text(&self, id: NodeId, preformatted: bool) -> String {
        let mut text = String::new();
        let mut stack: Vec<NodeId> = self.dom.children(id).collect();
        stack.reverse();
        while let Some(current) = stack.pop() {
            let node = &self.dom.nodes[current];
            match node.kind {
                Kind::Text => text.push_str(&node.text),
                Kind::Element => match role(self.dom, current) {
                    Role::Drop => {}
                    Role::Break => text.push(if preformatted { '\n' } else { ' ' }),
                    Role::Image => text.push_str(self.dom.attribute(current, "alt").unwrap_or("")),
                    _ => {
                        let start = stack.len();
                        stack.extend(self.dom.children(current));
                        stack[start..].reverse();
                    }
                },
                Kind::Document | Kind::Ignored => {}
            }
        }
        text
    }

    /// Renders a simple table as GFM; any other table aborts the rendering.
    fn enter_table(&mut self, id: NodeId, stack: &mut Vec<Visit>) -> Step {
        let rows = self.table_rows(id).ok_or(Abort)?;
        let columns = rows.first().map_or(0, |row| row.len());
        if columns == 0 || rows.iter().any(|row| row.len() != columns) {
            return Err(Abort);
        }
        if rows.len() == 1 && columns == 1 {
            // A single cell is just its content.
            self.open_block(id, Close::Block, stack);
            return Ok(());
        }
        let header_row = rows[0]
            .iter()
            .all(|&cell| self.dom.html_name(cell) == Some(&local_name!("th")));
        self.writer.request_break(Break::Blank);
        self.writer.table_start(columns, header_row)?;
        stack.push(Visit::TableEnd);
        for (index, row) in rows.iter().enumerate().rev() {
            let delimiter_columns = if header_row && index == 0 { columns } else { 0 };
            stack.push(Visit::TableRowEnd { delimiter_columns });
            for &cell in row.iter().rev() {
                stack.push(Visit::TableCellEnd);
                self.push_children(cell, stack);
                stack.push(Visit::TableCellStart);
            }
            stack.push(Visit::TableRowStart);
        }
        Ok(())
    }

    /// The cells of each row when the table is simple: rows only inside
    /// `thead`/`tbody`/`tfoot`, cells without spans and with inline content
    /// only, no caption or stray text, no nested table.
    fn table_rows(&self, table: NodeId) -> Option<Vec<Vec<NodeId>>> {
        let mut rows = Vec::new();
        let mut sections = vec![table];
        let mut index = 0;
        while let Some(&section) = sections.get(index) {
            index += 1;
            for child in self.dom.children(section) {
                if self.is_blank_text(child) || self.is_ignored(child) {
                    continue;
                }
                match self.dom.html_name(child)? {
                    &local_name!("thead") | &local_name!("tbody") | &local_name!("tfoot")
                        if section == table =>
                    {
                        sections.push(child);
                    }
                    &local_name!("colgroup") | &local_name!("col") => {}
                    &local_name!("tr") => rows.push(self.table_cells(child)?),
                    _ => return None,
                }
            }
        }
        Some(rows)
    }

    fn table_cells(&self, row: NodeId) -> Option<Vec<NodeId>> {
        let mut cells = Vec::new();
        for child in self.dom.children(row) {
            if self.is_blank_text(child) || self.is_ignored(child) {
                continue;
            }
            match self.dom.html_name(child)? {
                &local_name!("td") | &local_name!("th") => {}
                _ => return None,
            }
            let spans = ["colspan", "rowspan"].into_iter().any(|name| {
                self.dom
                    .attribute(child, name)
                    .is_some_and(|value| value.trim() != "1")
            });
            if spans || self.flags[child] & (HAS_BLOCK | HAS_BREAK) != 0 {
                return None;
            }
            cells.push(child);
        }
        Some(cells)
    }

    fn is_blank_text(&self, id: NodeId) -> bool {
        let node = &self.dom.nodes[id];
        node.kind == Kind::Text && node.text.chars().all(is_collapsible)
    }

    fn is_ignored(&self, id: NodeId) -> bool {
        self.dom.nodes[id].kind == Kind::Ignored
    }
}

/// Keeps `http`, `https`, and `mailto` destinations that need no
/// interpretation; anything else leaves the link text alone.
fn safe_destination(href: &str) -> Option<String> {
    let trimmed = href
        .trim_matches(|character: char| character.is_ascii_whitespace() || character.is_control());
    let allowed = ["http://", "https://", "mailto:"]
        .into_iter()
        .any(|scheme| {
            trimmed
                .get(..scheme.len())
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
        });
    if !allowed
        || trimmed.len() > MAX_DESTINATION_BYTES
        || trimmed.chars().any(|character| {
            character.is_whitespace()
                || character.is_control()
                || matches!(character, '<' | '>' | '\\' | '`')
        })
    {
        return None;
    }
    let mut destination = String::with_capacity(trimmed.len());
    for character in trimmed.chars() {
        if matches!(character, '(' | ')') {
            destination.push('\\');
        }
        destination.push(character);
    }
    Some(destination)
}

fn is_collapsible(character: char) -> bool {
    matches!(character, ' ' | '\t' | '\n' | '\r' | '\u{0C}')
}

fn is_line_break(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

fn longest_backtick_run(text: &str) -> usize {
    let mut longest = 0;
    let mut current = 0;
    for character in text.chars() {
        if character == '`' {
            current += 1;
            longest = longest.max(current);
        } else {
            current = 0;
        }
    }
    longest
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(super) enum Break {
    None,
    Line,
    Blank,
}

/// What separates two consecutive letters or digits.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum Gap {
    Joined,
    Spaced,
    Broken,
}

impl Gap {
    fn widen(self, character: char) -> Self {
        if is_line_break(character) {
            Self::Broken
        } else {
            self.max(Self::Spaced)
        }
    }
}

/// The plain text's letters and digits, lowercased, each with the gap before it.
struct Fingerprint<'p> {
    characters: std::str::Chars<'p>,
    lowered: Option<std::char::ToLowercase>,
}

impl Iterator for Fingerprint<'_> {
    type Item = (char, Gap);

    fn next(&mut self) -> Option<(char, Gap)> {
        if let Some(character) = self.lowered.as_mut().and_then(Iterator::next) {
            return Some((character, Gap::Joined));
        }
        self.lowered = None;
        let mut gap = Gap::Joined;
        for character in self.characters.by_ref() {
            if character.is_alphanumeric() {
                let mut lowered = character.to_lowercase();
                let first = lowered.next()?;
                self.lowered = Some(lowered);
                return Some((first, gap));
            }
            gap = gap.widen(character);
        }
        None
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum LineState {
    /// Nothing but container syntax on the line: block markers would start here.
    Start,
    /// Only digits so far, which a `.` or `)` would turn into a list marker.
    Digits(u8),
    Other,
}

enum Container {
    Quote,
    Item { marker: String, started: bool },
}

struct InlineFrame {
    marker_len: usize,
    closing: String,
    written: bool,
}

struct Writer<'p> {
    out: String,
    cap: usize,
    plain: Fingerprint<'p>,
    gap: Gap,
    matched_any: bool,
    containers: Vec<Container>,
    pending_break: Break,
    hard_breaks: usize,
    pending_space: bool,
    /// Opening markers waiting for the first content inside them.
    markers: String,
    /// Open inline elements, innermost last.
    frames: Vec<InlineFrame>,
    line: LineState,
    line_has_content: bool,
    started: bool,
    formatted: bool,
    heading: bool,
    table: bool,
}

impl<'p> Writer<'p> {
    fn new(plain: &'p str, cap: usize) -> Self {
        Self {
            out: String::new(),
            cap,
            plain: Fingerprint {
                characters: plain.chars(),
                lowered: None,
            },
            gap: Gap::Joined,
            matched_any: false,
            containers: Vec::new(),
            pending_break: Break::None,
            hard_breaks: 0,
            pending_space: false,
            markers: String::new(),
            frames: Vec::new(),
            line: LineState::Start,
            line_has_content: false,
            started: false,
            formatted: false,
            heading: false,
            table: false,
        }
    }

    /// The Markdown, or `None` when parity, size, or usefulness fails.
    fn finish(mut self) -> Option<String> {
        if self.plain.next().is_some() || !self.formatted {
            return None;
        }
        let length = self.out.trim_end().len();
        self.out.truncate(length);
        (!self.out.trim().is_empty()).then_some(self.out)
    }

    fn push(&mut self, text: &str) -> Step {
        if self.out.len().saturating_add(text.len()) > self.cap {
            return Err(Abort);
        }
        self.out.push_str(text);
        Ok(())
    }

    fn syntax(&mut self, text: &str) -> Step {
        for character in text.chars() {
            if is_line_break(character) {
                self.gap = Gap::Broken;
            } else if character.is_whitespace() {
                self.gap = self.gap.max(Gap::Spaced);
            }
        }
        self.push(text)
    }

    fn content(&mut self, character: char) -> Step {
        if character.is_alphanumeric() {
            for lowered in character.to_lowercase() {
                let (expected, plain_gap) = self.plain.next().ok_or(Abort)?;
                if expected != lowered || (self.matched_any && plain_gap != self.gap) {
                    return Err(Abort);
                }
                self.matched_any = true;
                self.gap = Gap::Joined;
            }
        } else {
            self.gap = self.gap.widen(character);
        }
        let mut buffer = [0; 4];
        self.push(character.encode_utf8(&mut buffer))
    }

    fn in_item(&self) -> bool {
        self.containers
            .iter()
            .any(|container| matches!(container, Container::Item { .. }))
    }

    fn request_break(&mut self, kind: Break) {
        self.pending_break = self.pending_break.max(kind);
    }

    fn open_container(&mut self, container: Container) {
        self.containers.push(container);
    }

    fn close_container(&mut self) {
        self.containers.pop();
    }

    /// The prefix of a new line: quote markers, item indentation, and the
    /// marker of an item whose first line this is. A blank line stops before
    /// any item that has not started and carries no trailing spaces.
    fn write_prefix(&mut self, blank: bool) -> Step {
        let mut prefix = String::new();
        for container in &mut self.containers {
            match container {
                Container::Quote => prefix.push_str("> "),
                Container::Item { marker, started } if *started => {
                    prefix.push_str(&" ".repeat(marker.len()));
                }
                Container::Item { .. } if blank => break,
                Container::Item { marker, started } => {
                    prefix.push_str(marker);
                    *started = true;
                    self.formatted = true;
                }
            }
        }
        if self
            .containers
            .iter()
            .any(|container| matches!(container, Container::Quote))
        {
            self.formatted = true;
        }
        if blank {
            let length = prefix.trim_end().len();
            prefix.truncate(length);
        }
        self.syntax(&prefix)?;
        self.line = LineState::Start;
        self.line_has_content = false;
        Ok(())
    }

    /// Starts the line content will go on, honouring a pending block break.
    fn start_block_line(&mut self) -> Step {
        let pending = std::mem::replace(&mut self.pending_break, Break::None);
        if !self.started {
            self.started = true;
            self.pending_space = false;
            self.hard_breaks = 0;
            return self.write_prefix(false);
        }
        match pending {
            Break::None => return Ok(()),
            Break::Line => {}
            Break::Blank => {
                self.syntax("\n")?;
                self.write_prefix(true)?;
            }
        }
        self.pending_space = false;
        self.hard_breaks = 0;
        self.syntax("\n")?;
        self.write_prefix(false)
    }

    /// Writes whatever must precede inline content: a block break, hard
    /// breaks, one collapsed space, then waiting opening markers.
    fn prepare_inline(&mut self) -> Step {
        if !self.started || self.pending_break != Break::None {
            self.start_block_line()?;
        } else if self.hard_breaks > 0 {
            let count = std::mem::take(&mut self.hard_breaks);
            self.pending_space = false;
            if self.line_has_content {
                for _ in 0..count {
                    self.syntax("\\\n")?;
                    self.write_prefix(false)?;
                }
            }
        } else if std::mem::take(&mut self.pending_space) && self.line_has_content {
            self.content(' ')?;
        }
        if !self.markers.is_empty() {
            let markers = std::mem::take(&mut self.markers);
            self.syntax(&markers)?;
            for frame in &mut self.frames {
                frame.written = true;
            }
            self.line = LineState::Other;
            self.line_has_content = true;
            self.formatted = true;
        }
        Ok(())
    }

    fn open_inline(&mut self, marker: &str, closing: &str) {
        self.markers.push_str(marker);
        self.frames.push(InlineFrame {
            marker_len: marker.len(),
            closing: closing.to_owned(),
            written: false,
        });
    }

    /// Closes the innermost inline element: its closing marker when it held
    /// content, otherwise its unwritten opening marker is withdrawn (inner
    /// elements closed first, so that marker is the last one waiting).
    fn close_inline(&mut self) -> Step {
        let frame = self.frames.pop().ok_or(Abort)?;
        if !frame.written {
            let length = self
                .markers
                .len()
                .checked_sub(frame.marker_len)
                .ok_or(Abort)?;
            self.markers.truncate(length);
            return Ok(());
        }
        self.syntax(&frame.closing)?;
        self.line = LineState::Other;
        Ok(())
    }

    fn text(&mut self, text: &str) -> Step {
        let mut characters = text.chars().peekable();
        while let Some(character) = characters.next() {
            if is_collapsible(character) {
                self.pending_space = true;
                continue;
            }
            self.prepare_inline()?;
            if self.needs_escape(character, characters.peek().copied()) {
                self.syntax("\\")?;
            }
            self.content(character)?;
            self.advance_line(character);
        }
        Ok(())
    }

    fn advance_line(&mut self, character: char) {
        self.line = match self.line {
            LineState::Start if character.is_ascii_digit() => LineState::Digits(1),
            LineState::Digits(count) if character.is_ascii_digit() && count < 9 => {
                LineState::Digits(count + 1)
            }
            _ => LineState::Other,
        };
        self.line_has_content = true;
    }

    fn needs_escape(&self, character: char, next: Option<char>) -> bool {
        match character {
            '\\' | '`' | '*' | '_' | '[' | ']' | '<' | '~' => true,
            '|' => self.table,
            '#' if self.heading => true,
            '&' => next.is_some_and(|next| next == '#' || next.is_ascii_alphanumeric()),
            '#' | '>' | '-' | '+' | '=' => self.line == LineState::Start,
            '.' | ')' => matches!(self.line, LineState::Digits(_)),
            _ => false,
        }
    }

    /// A `<br>`: written before the next content on the same line, dropped
    /// at the start of a line or before a block break.
    fn hard_break(&mut self) {
        self.hard_breaks = self.hard_breaks.saturating_add(1);
    }

    fn inline_code(&mut self, text: &str) -> Step {
        let mut collapsed = String::with_capacity(text.len());
        let mut space = false;
        for character in text.chars() {
            if is_collapsible(character) {
                space = true;
            } else {
                if space && !collapsed.is_empty() {
                    collapsed.push(' ');
                }
                space = false;
                collapsed.push(character);
            }
        }
        if text.starts_with(is_collapsible) {
            self.pending_space = true;
        }
        if collapsed.is_empty() {
            return Ok(());
        }
        self.prepare_inline()?;
        let fence = "`".repeat(longest_backtick_run(&collapsed) + 1);
        let pad = collapsed.starts_with('`') || collapsed.ends_with('`');
        self.syntax(&fence)?;
        if pad {
            self.syntax(" ")?;
        }
        for character in collapsed.chars() {
            if character == '|' && self.table {
                self.syntax("\\")?;
            }
            self.content(character)?;
        }
        if pad {
            self.syntax(" ")?;
        }
        self.syntax(&fence)?;
        self.line = LineState::Other;
        self.line_has_content = true;
        self.formatted = true;
        if text.ends_with(is_collapsible) {
            self.pending_space = true;
        }
        Ok(())
    }

    fn code_block(&mut self, text: &str) -> Step {
        let text = text.strip_suffix('\n').unwrap_or(text);
        if text.chars().all(char::is_whitespace) {
            return Ok(());
        }
        self.start_block_line()?;
        let fence = "`".repeat((longest_backtick_run(text) + 1).max(3));
        self.syntax(&fence)?;
        for line in text.split('\n') {
            self.syntax("\n")?;
            self.write_prefix(false)?;
            for character in line.chars() {
                self.content(character)?;
            }
        }
        self.syntax("\n")?;
        self.write_prefix(false)?;
        self.syntax(&fence)?;
        self.line = LineState::Other;
        self.line_has_content = true;
        self.formatted = true;
        Ok(())
    }

    fn rule(&mut self) -> Step {
        self.start_block_line()?;
        self.syntax("---")?;
        self.line = LineState::Other;
        self.line_has_content = true;
        self.formatted = true;
        Ok(())
    }

    fn table_start(&mut self, columns: usize, header_row: bool) -> Step {
        self.table = true;
        self.formatted = true;
        if header_row {
            return Ok(());
        }
        // GFM needs a header row; an empty one keeps every row as data.
        self.start_block_line()?;
        self.syntax(&format!("|{}", "  |".repeat(columns)))?;
        self.request_break(Break::Line);
        self.start_block_line()?;
        self.syntax(&format!("|{}", " --- |".repeat(columns)))
    }

    fn table_row_start(&mut self) -> Step {
        self.request_break(Break::Line);
        self.start_block_line()?;
        self.syntax("|")?;
        self.line = LineState::Other;
        Ok(())
    }

    fn table_cell_start(&mut self) -> Step {
        self.syntax(" ")?;
        self.pending_space = false;
        self.line_has_content = false;
        self.line = LineState::Other;
        Ok(())
    }

    fn table_cell_end(&mut self) -> Step {
        self.pending_space = false;
        self.syntax(" |")
    }

    fn table_row_end(&mut self, delimiter_columns: usize) -> Step {
        if delimiter_columns > 0 {
            self.request_break(Break::Line);
            self.start_block_line()?;
            self.syntax(&format!("|{}", " --- |".repeat(delimiter_columns)))?;
        }
        Ok(())
    }

    fn table_end(&mut self) {
        self.table = false;
        self.request_break(Break::Blank);
    }
}
