use std::time::{Duration, Instant};

use super::{convert, dom, markdown, Limits, LIMITS, MAX_DOM_DEPTH, MAX_HTML_BYTES};

/// Real bounds with a generous clock, so results never depend on machine load.
const TEST_LIMITS: Limits = Limits {
    time: Duration::from_secs(60),
    ..LIMITS
};

fn md(html: &str, plain: &str) -> Option<String> {
    super::html_to_markdown_untimed(html.as_bytes(), plain)
}

/// The converter without its panic guard, so a defect fails the test.
fn md_unguarded(html: &str, plain: &str, limits: &Limits) -> Option<String> {
    let deadline = Instant::now() + limits.time;
    let dom = dom::parse(html, limits.nodes, limits.depth, deadline)?;
    markdown::render(&dom, plain, limits, deadline)
}

fn assert_md(html: &str, plain: &str, expected: &str) {
    assert_eq!(md(html, plain).as_deref(), Some(expected), "{html}");
}

#[test]
fn formatting_keeps_strong_and_emphasis() {
    let result = md("<p><b>bold</b> and <i>it</i></p>", "bold and it").expect("markdown");
    assert!(result.contains("**bold**"), "{result}");
    assert!(
        result.contains("*it*") || result.contains("_it_"),
        "{result}"
    );
    assert_eq!(result, "**bold** and *it*");
}

#[test]
fn formatting_keeps_only_web_and_mail_links() {
    let html = concat!(
        "<p><a href=\"https://example.test/a\">site</a>, ",
        "<a href=\" JavaScript:alert(1)\">bad</a>, ",
        "<a href=\"data:text/html,<b>x</b>\">inline</a>, ",
        "<a href=\"vbscript:x\">vb</a>, ",
        "<a href=\"/relative\">rel</a>, ",
        "<a href=\"MAILTO:someone@example.test\">mail</a></p>"
    );
    let result = md(html, "site, bad, inline, vb, rel, mail").expect("markdown");
    assert_eq!(
        result,
        "[site](https://example.test/a), bad, inline, vb, rel, [mail](MAILTO:someone@example.test)"
    );
    let lowered = result.to_lowercase();
    for scheme in ["javascript:", "data:", "vbscript:", "/relative"] {
        assert!(!lowered.contains(scheme), "{result}");
    }
}

#[test]
fn formatting_link_destinations_need_no_interpretation() {
    assert_md(
        "<a href=\"https://example.test/wiki/A_(b)\">wiki</a>",
        "wiki",
        "[wiki](https://example.test/wiki/A_\\(b\\))",
    );
    // Whitespace, angle brackets, or an oversized destination keep the text only.
    for href in [
        "https://example.test/a b".to_owned(),
        "https://example.test/<x>".to_owned(),
        format!("https://example.test/{}", "a".repeat(2048)),
    ] {
        let html = format!("<p><b>b</b> <a href=\"{href}\">text</a></p>");
        assert_eq!(md(&html, "b text").as_deref(), Some("**b** text"));
    }
}

#[test]
fn formatting_renders_lists_headings_and_code_blocks() {
    assert_md("<ul><li>a</li><li>b</li></ul>", "a\nb", "- a\n- b");
    assert_md("<h2>T</h2>", "T", "## T");
    assert_md(
        "<pre><code>x = 1\nif a:\n    b()</code></pre>",
        "x = 1\nif a:\n    b()",
        "```\nx = 1\nif a:\n    b()\n```",
    );
    assert_md(
        "<h1>Title</h1><p>Intro <code>cargo test</code>.</p><ol start=\"3\"><li>one</li><li>two</li></ol>",
        "Title\n\nIntro cargo test.\n\none\ntwo",
        "# Title\n\nIntro `cargo test`.\n\n3. one\n4. two",
    );
}

#[test]
fn formatting_nests_lists_quotes_and_code_inside_items() {
    assert_md(
        "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>",
        "a\nb\nc",
        "- a\n  - b\n\n- c",
    );
    assert_md(
        "<ol><li>run<pre>make\nmake test</pre></li></ol>",
        "run\nmake\nmake test",
        "1. run\n\n   ```\n   make\n   make test\n   ```",
    );
    assert_md(
        "<blockquote><p>q</p><p>r <b>s</b></p></blockquote>",
        "q\n\nr s",
        "> q\n>\n> r **s**",
    );
}

#[test]
fn formatting_renders_simple_tables_and_gives_up_on_others() {
    assert_md(
        "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><code>a|b</code></td></tr></tbody></table>",
        "A\tB\n1\ta|b",
        "| A | B |\n| --- | --- |\n| 1 | `a\\|b` |",
    );
    assert_md(
        "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>",
        "a\tb\nc\td",
        "|  |  |\n| --- | --- |\n| a | b |\n| c | d |",
    );
    for table in [
        "<table><tr><td colspan=\"2\">a</td></tr><tr><td>b</td><td>c</td></tr></table>",
        "<table><tr><td>a<br>x</td><td>b</td></tr></table>",
        "<table><caption>Cap</caption><tr><td>a</td><td>b</td></tr></table>",
        "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>",
        "<table><tr><td><table><tr><td>a</td><td>b</td></tr></table></td><td>c</td></tr></table>",
    ] {
        assert_eq!(md(table, "a b c x Cap"), None, "{table}");
    }
}

#[test]
fn formatting_rejects_text_the_user_did_not_see() {
    assert_eq!(
        md(
            "<p><b>public</b> <span style=\"display:none\">secret</span></p>",
            "public"
        ),
        None
    );
}

#[test]
fn formatting_never_emits_scripts_styles_or_images() {
    let html = concat!(
        "<style>.x{content:'STYLETEXT'}</style><p><b>a</b>",
        "<script>var s='SCRIPTTEXT'</script> ",
        "<img alt=\"chart\" src=\"https://example.test/i.png\"> ",
        "<svg><text>SVGTEXT</text></svg><noscript>NOSCRIPTTEXT</noscript>",
        "<iframe src=\"https://example.test/\">FRAMETEXT</iframe>",
        "<template>TEMPLATETEXT</template><input value=\"INPUTTEXT\"></p>"
    );
    // The image's alternative text is plain text, as in the browser's own copy.
    let result = md(html, "a chart").expect("markdown");
    assert_eq!(result, "**a** chart");
    for hidden in [
        "STYLE", "SCRIPT", "SVG", "NOSCRIPT", "FRAME", "TEMPLATE", "INPUT", "https", "![",
    ] {
        assert!(!result.contains(hidden), "{result}");
    }
    // A plain text without the alternative text rejects the HTML.
    assert_eq!(md(html, "a"), None);
}

#[test]
fn formatting_keeps_unknown_inline_tags_as_text() {
    let result = md(
        "<p><u>under</u> <span>span</span> <mark>mark</mark> <b>bold</b> <x-custom>custom</x-custom></p>",
        "under span mark bold custom",
    )
    .expect("markdown");
    assert_eq!(result, "under span mark **bold** custom");
    for raw in ["<u", "<span", "<mark", "<x-"] {
        assert!(!result.contains(raw), "{result}");
    }
}

#[test]
fn formatting_parity_ignores_case_and_punctuation() {
    assert_md(
        "<p><b>HELLO</b> world</p>",
        "hello WORLD",
        "**HELLO** world",
    );
    assert_md(
        "<p><i>a</i>\u{a0}b \u{2014} c</p>",
        "a b \u{2014} c",
        "*a*\u{a0}b \u{2014} c",
    );
}

#[test]
fn formatting_parity_compares_word_and_line_boundaries() {
    // Same letters, different words.
    assert_eq!(md("<p><b>a</b>b</p>", "a b"), None);
    assert_eq!(md("<p><b>a</b> b</p>", "ab"), None);
    // Same letters, a line break only on one side (for example CSS pre-wrap).
    assert_eq!(md("<p><b>a</b></p><p>b</p>", "a b"), None);
    assert_eq!(
        md("<div><span>l1\nl2</span> <b>x</b></div>", "l1\nl2 x"),
        None
    );
    // Extra or missing content on either side.
    assert_eq!(md("<p><b>a</b> b</p>", "a b c"), None);
    assert_eq!(md("<p><b>a</b> b c</p>", "a b"), None);
    assert_eq!(md("<p><b>a</b> 1</p>", "a 2"), None);
}

#[test]
fn formatting_without_formatting_keeps_plain_text() {
    assert_eq!(
        md("<p>just words</p><p>more</p>", "just words\n\nmore"),
        None
    );
    assert_eq!(md("<p>a<br>b</p>", "a\nb"), None);
    assert_eq!(md("<p>1. *not* markdown</p>", "1. *not* markdown"), None);
}

#[test]
fn formatting_escapes_markdown_in_selected_text() {
    assert_md(
        "<p><b>b</b> *a* _c_ [d](e) `f` &lt;g&gt; ~h~ \\ &amp;amp; & x</p>",
        "b *a* _c_ [d](e) `f` <g> ~h~ \\ &amp; & x",
        "**b** \\*a\\* \\_c\\_ \\[d\\](e) \\`f\\` \\<g> \\~h\\~ \\\\ \\&amp; & x",
    );
    assert_md(
        "<p><b>b</b></p><p>- dash</p><p>+ plus</p><p># hash</p><p>&gt; quote</p><p>= eq</p><p>12. num</p><p>3) par</p>",
        "b\n\n- dash\n\n+ plus\n\n# hash\n\n> quote\n\n= eq\n\n12. num\n\n3) par",
        "**b**\n\n\\- dash\n\n\\+ plus\n\n\\# hash\n\n\\> quote\n\n\\= eq\n\n12\\. num\n\n3\\) par",
    );
    assert_md("<h3>C# notes #2</h3>", "C# notes #2", "### C\\# notes \\#2");
}

#[test]
fn formatting_code_spans_and_fences_outgrow_their_backticks() {
    assert_md("<p><code>a`b</code></p>", "a`b", "``a`b``");
    assert_md("<p><code>`x`</code></p>", "`x`", "`` `x` ``");
    assert_md(
        "<pre>```\ncode\n```</pre>",
        "```\ncode\n```",
        "````\n```\ncode\n```\n````",
    );
}

#[test]
fn formatting_places_markers_around_trimmed_content() {
    assert_md(
        "<p>a<b> bold </b>c <i></i>d <b><b>twice</b></b></p>",
        "a bold c d twice",
        "a **bold** c d **twice**",
    );
    assert_md("<p><b>a<br>b</b><br>c</p>", "a\nb\nc", "**a\\\nb**\\\nc");
}

#[test]
fn formatting_ignores_formatting_cancelled_by_inline_style() {
    // Google Docs wraps a whole copy in a non-bold `<b>`.
    assert_md(
        "<b style=\"font-weight:normal;\" id=\"docs-internal-guid-1\"><span>plain</span> <i>it</i></b>",
        "plain it",
        "plain *it*",
    );
}

#[test]
fn formatting_rejects_invalid_oversized_deep_or_blank_html() {
    assert_eq!(convert(&[0xff, 0xfe, b'<', b'b'], "b", &TEST_LIMITS), None);
    let oversized = format!("<b>{}</b>", "a".repeat(MAX_HTML_BYTES));
    assert!(oversized.len() > MAX_HTML_BYTES);
    assert_eq!(md(&oversized, &"a".repeat(MAX_HTML_BYTES)), None);
    let deep = format!("{}<b>x</b>{}", "<div>".repeat(200), "</div>".repeat(200));
    assert_eq!(md(&deep, "x"), None);
    let shallow = format!(
        "{}<b>x</b>{}",
        "<div>".repeat(MAX_DOM_DEPTH - 8),
        "</div>".repeat(MAX_DOM_DEPTH - 8)
    );
    assert_eq!(md(&shallow, "x").as_deref(), Some("**x**"));
    assert_eq!(md(" \n\t ", "x"), None);
    assert_eq!(md("<b>x</b>", "  "), None);
}

#[test]
fn formatting_bounds_nodes_output_and_time() {
    let html = "<p><b>a</b> b</p>".repeat(50);
    let plain = vec!["a b"; 50].join("\n\n");
    assert!(md(&html, &plain).is_some());

    let few_nodes = Limits {
        nodes: 40,
        ..TEST_LIMITS
    };
    assert_eq!(convert(html.as_bytes(), &plain, &few_nodes), None);

    let small_output = Limits {
        markdown_bytes: 64,
        ..TEST_LIMITS
    };
    assert_eq!(convert(html.as_bytes(), &plain, &small_output), None);

    let no_time = Limits {
        time: Duration::ZERO,
        ..TEST_LIMITS
    };
    assert_eq!(convert(html.as_bytes(), &plain, &no_time), None);
}

#[test]
fn formatting_public_entry_point_applies_the_size_bound() {
    let oversized = vec![b'a'; MAX_HTML_BYTES + 1];
    assert_eq!(super::html_to_markdown(&oversized, "a"), None);
    assert_eq!(super::html_to_markdown(b"\xc3\x28", "a"), None);
}

/// Deterministic xorshift generator for the property-style tests.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next() % bound as u64) as usize
    }

    fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
        items[self.below(items.len())]
    }
}

const WORDS: &[&str] = &[
    "alpha",
    "Beta",
    "42",
    "x_y",
    "*star*",
    "[link]",
    "#tag",
    "a|b",
    "`tick`",
    "<tag>",
    "1.",
    "-",
    "+",
    "~",
    "&amp;",
    "Été",
    "naïve",
    "ÆØÅ",
    "Straße",
    "İstanbul",
    "日本語",
    "😀",
    "(paren)",
    "back\\slash",
    "!",
    "=",
    ">",
];

/// Builds well-formed HTML with known visible text: blocks separated by line
/// breaks and words by spaces, like a browser's own plain-text copy. Also
/// reports whether anything in it is Markdown formatting.
fn structured_document(random: &mut Random) -> (String, String, bool) {
    let mut html = String::new();
    let mut plain_lines = Vec::new();
    let mut formatted = false;
    for _ in 0..(1 + random.below(6)) {
        let kind = random.below(6);
        formatted |= kind < 4;
        match kind {
            0 => {
                let (inline, text) = inline_run(random, &mut formatted);
                let level = 1 + random.below(6);
                html.push_str(&format!("<h{level}>{inline}</h{level}>"));
                plain_lines.push(text);
            }
            1 => {
                let tag = random.pick(&["ul", "ol"]);
                html.push_str(&format!("<{tag}>"));
                for _ in 0..(1 + random.below(4)) {
                    let (inline, text) = inline_run(random, &mut formatted);
                    html.push_str(&format!("<li>{inline}</li>"));
                    plain_lines.push(text);
                }
                html.push_str(&format!("</{tag}>"));
            }
            2 => {
                let (inline, text) = inline_run(random, &mut formatted);
                html.push_str(&format!("<blockquote><p>{inline}</p></blockquote>"));
                plain_lines.push(text);
            }
            3 => {
                let lines: Vec<String> = (0..(1 + random.below(3)))
                    .map(|_| {
                        (0..(1 + random.below(3)))
                            .map(|_| random.pick(WORDS).replace("&amp;", "&"))
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .collect();
                let escaped = lines.join("\n").replace('&', "&amp;").replace('<', "&lt;");
                html.push_str(&format!("<pre><code>{escaped}</code></pre>"));
                plain_lines.extend(lines);
            }
            _ => {
                let (inline, text) = inline_run(random, &mut formatted);
                html.push_str(&format!("<p>{inline}</p>"));
                plain_lines.push(text);
            }
        }
    }
    (html, plain_lines.join("\n"), formatted)
}

/// One line of inline content: (HTML, visible text).
fn inline_run(random: &mut Random, formatted: &mut bool) -> (String, String) {
    let mut html = Vec::new();
    let mut text = Vec::new();
    for _ in 0..(1 + random.below(5)) {
        let word = random.pick(WORDS);
        let visible = word.replace("&amp;", "&");
        let escaped = visible.replace('&', "&amp;").replace('<', "&lt;");
        let wrap = random.below(8);
        *formatted |= wrap < 5;
        let wrapped = match wrap {
            0 => format!("<b>{escaped}</b>"),
            1 => format!("<em>{escaped}</em>"),
            2 => format!("<code>{escaped}</code>"),
            3 => format!(
                "<a href=\"https://example.test/{}\">{escaped}</a>",
                random.below(99)
            ),
            4 => format!("<del>{escaped}</del>"),
            5 => format!("<span>{escaped}</span>"),
            _ => escaped,
        };
        html.push(wrapped);
        text.push(visible);
    }
    (html.join(" "), text.join(" "))
}

fn fingerprint(text: &str) -> String {
    text.chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_subsequence(needle: &str, haystack: &str) -> bool {
    let mut haystack = haystack.chars();
    needle
        .chars()
        .all(|wanted| haystack.by_ref().any(|found| found == wanted))
}

/// Every unescaped `](` opens a destination with an allowed scheme.
fn destinations_are_safe(markdown: &str) -> bool {
    let bytes = markdown.as_bytes();
    let mut index = 0;
    while let Some(offset) = markdown[index..].find("](") {
        let at = index + offset;
        let escaped = at > 0 && bytes[at - 1] == b'\\';
        if !escaped {
            let destination = markdown[at + 2..].to_ascii_lowercase();
            if !["http://", "https://", "mailto:"]
                .iter()
                .any(|scheme| destination.starts_with(scheme))
            {
                return false;
            }
        }
        index = at + 2;
    }
    true
}

#[test]
fn formatting_property_structured_documents_round_trip_their_text() {
    let mut random = Random(0x9e37_79b9_7f4a_7c15);
    let mut converted = 0;
    for _ in 0..400 {
        let (html, plain, formatted) = structured_document(&mut random);
        let result = md_unguarded(&html, &plain, &TEST_LIMITS);
        if !formatted {
            assert_eq!(result, None, "{html:?}");
            continue;
        }
        let markdown = result.unwrap_or_else(|| panic!("no markdown for {html:?} / {plain:?}"));
        converted += 1;
        assert!(is_subsequence(
            &fingerprint(&plain),
            &fingerprint(&markdown)
        ));
        assert!(destinations_are_safe(&markdown), "{markdown}");
        assert_eq!(
            md_unguarded(&html, &plain, &TEST_LIMITS).as_deref(),
            Some(markdown.as_str())
        );
    }
    assert!(converted > 300, "{converted}");
}

const TAGS: &[&str] = &[
    "p",
    "div",
    "b",
    "i",
    "em",
    "strong",
    "a",
    "ul",
    "ol",
    "li",
    "table",
    "tr",
    "td",
    "th",
    "tbody",
    "pre",
    "code",
    "blockquote",
    "h1",
    "h3",
    "br",
    "hr",
    "span",
    "script",
    "style",
    "img",
    "svg",
    "math",
    "template",
    "select",
    "option",
    "textarea",
    "iframe",
    "noscript",
    "font",
    "nobr",
    "form",
    "frameset",
    "caption",
    "colgroup",
    "head",
    "body",
    "html",
    "title",
    "button",
    "u",
    "s",
    "kbd",
    "details",
    "summary",
    "mglyph",
    "foreignObject",
    "desc",
    "annotation-xml",
];

const ATTRIBUTES: &[&str] = &[
    "",
    " href=\"https://example.test/x\"",
    " href=\"javascript:SECRETMARK()\"",
    " href=\" jav&#x09;ascript:alert(1)\"",
    " href=\"data:text/html,SECRETMARK\"",
    " href=\"https://example.test/a b\"",
    " style=\"font-weight:normal\"",
    " colspan=\"2\"",
    " start=\"99999999999999999999\"",
    " hidden",
    " alt=\"alt text\"",
    " src=\"https://example.test/SECRETMARK.png\"",
];

const FRAGMENTS: &[&str] = &[
    "text",
    " ",
    "\n",
    "&amp;",
    "&lt;",
    "&#0;",
    "&#x110000;",
    "&nbsp;",
    "<!-- c -->",
    "<![CDATA[x]]>",
    "<!DOCTYPE html>",
    "</",
    "<",
    ">",
    "\u{0}",
    "\u{202e}",
    "&notanentity;",
    "*",
    "`",
    "|",
    "#",
    "1.",
    "\\",
];

/// Tag soup from a hostile page: unbalanced, misnested, foreign content,
/// hostile URLs, and text hidden in dropped elements (`SECRETMARK`).
fn tag_soup(random: &mut Random, length: usize) -> String {
    let mut html = String::new();
    for _ in 0..length {
        match random.below(5) {
            0 | 1 => {
                let tag = random.pick(TAGS);
                let attribute = random.pick(ATTRIBUTES);
                html.push_str(&format!("<{tag}{attribute}>"));
                if matches!(
                    tag,
                    "script" | "style" | "template" | "noscript" | "textarea"
                ) {
                    html.push_str("SECRETMARK");
                }
            }
            2 => html.push_str(&format!("</{}>", random.pick(TAGS))),
            _ => html.push_str(random.pick(FRAGMENTS)),
        }
    }
    html
}

#[test]
fn formatting_property_hostile_tag_soup_is_bounded_and_safe() {
    let mut random = Random(0xdead_beef_cafe_f00d);
    let plains = ["text", "text text", "alt text text", "SECRETMARK text", ""];
    for round in 0..600 {
        let length = 1 + random.below(120);
        let html = tag_soup(&mut random, length);
        for plain in plains {
            let first = md_unguarded(&html, plain, &TEST_LIMITS);
            if let Some(markdown) = &first {
                assert!(!markdown.contains("SECRETMARK"), "{html:?} -> {markdown}");
                assert!(destinations_are_safe(markdown), "{html:?} -> {markdown}");
                assert!(is_subsequence(&fingerprint(plain), &fingerprint(markdown)));
                assert!(markdown.len() <= TEST_LIMITS.markdown_bytes);
            }
            if round % 4 == 0 {
                assert_eq!(first, md_unguarded(&html, plain, &TEST_LIMITS));
            }
        }
        // The same soup under a tiny node budget exercises the overflow sink.
        let tight = Limits {
            nodes: 8,
            ..TEST_LIMITS
        };
        let _ = md_unguarded(&html, "text", &tight);
    }
}

#[test]
fn formatting_property_pathological_shapes_stay_within_bounds() {
    let deep_lists = format!(
        "{}{}{}",
        "<ul><li>x".repeat(100),
        "<br>y".repeat(20_000),
        "</li></ul>".repeat(100)
    );
    let cases = [
        // Deep nesting of every kind, beyond and within the depth bound.
        "<div>".repeat(100_000),
        "<b>".repeat(100_000),
        "<table>".repeat(20_000),
        "<a href=\"https://example.test/\">".repeat(30_000),
        "<p><i><b></p>x".repeat(30_000),
        // Many nodes beyond the budget.
        "<span>w</span>".repeat(60_000),
        // Huge text, entities, attributes, and lines within the byte bound.
        "&amp;".repeat(200_000),
        format!("<b>{}</b>", "w ".repeat(400_000)),
        format!(
            "<a href=\"https://example.test/{}\">w</a>",
            "a".repeat(900_000)
        ),
        format!("<pre>{}</pre>", "`".repeat(900_000)),
        deep_lists,
    ];
    for html in cases {
        assert!(
            html.len() <= MAX_HTML_BYTES,
            "case too large: {}",
            html.len()
        );
        let started = Instant::now();
        for plain in ["w", "x y", "x"] {
            if let Some(markdown) = md_unguarded(&html, plain, &TEST_LIMITS) {
                assert!(markdown.len() <= TEST_LIMITS.markdown_bytes);
            }
        }
        // Debug builds are slow; this only guards against runaway work.
        assert!(started.elapsed() < Duration::from_secs(30));
    }
}
