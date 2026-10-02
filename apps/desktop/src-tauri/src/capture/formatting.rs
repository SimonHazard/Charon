//! Opt-in formatted capture (ADR 0026): turns the HTML that the source
//! application's own Copy produced into Markdown, or gives up.
//!
//! This is a pure, in-memory function. It performs no I/O, never resolves or
//! fetches a URL, never evaluates scripts or stylesheets, and never logs or
//! returns anything derived from the HTML except the finished Markdown. Every
//! stage is bounded (input bytes, nodes, depth, output bytes, time) and walks
//! the tree with explicit stacks. The Markdown is returned only when its
//! letters and digits, and the boundaries between them, match the plain text
//! the same Copy produced, and when it adds some formatting; otherwise the
//! caller keeps the exact plain text.

mod dom;
mod markdown;

use std::panic::{self, AssertUnwindSafe};
use std::time::{Duration, Instant};

/// The largest HTML representation Charon parses.
pub const MAX_HTML_BYTES: usize = 1024 * 1024;
/// The most nodes (elements and text runs) one selection may produce.
pub const MAX_DOM_NODES: usize = 20_000;
/// The deepest element nesting Charon renders.
pub const MAX_DOM_DEPTH: usize = 128;
/// The longest Markdown Charon returns.
pub const MAX_MARKDOWN_BYTES: usize = 4 * MAX_HTML_BYTES;
/// The time budget for parsing and rendering one selection.
pub const MAX_CONVERSION: Duration = Duration::from_millis(50);

struct Limits {
    html_bytes: usize,
    nodes: usize,
    depth: usize,
    markdown_bytes: usize,
    time: Duration,
}

const LIMITS: Limits = Limits {
    html_bytes: MAX_HTML_BYTES,
    nodes: MAX_DOM_NODES,
    depth: MAX_DOM_DEPTH,
    markdown_bytes: MAX_MARKDOWN_BYTES,
    time: MAX_CONVERSION,
};

/// Returns Markdown only when every bound and the parity check pass and the
/// result adds formatting; `None` keeps the plain text.
pub fn html_to_markdown(html: &[u8], plain: &str) -> Option<String> {
    convert(html, plain, &LIMITS)
}

fn convert(html: &[u8], plain: &str, limits: &Limits) -> Option<String> {
    let started = Instant::now();
    if html.len() > limits.html_bytes {
        return None;
    }
    // Strict decoding: anything that is not valid UTF-8 keeps the plain text.
    let html = std::str::from_utf8(html).ok()?;
    if html.trim().is_empty() || plain.trim().is_empty() {
        return None;
    }
    let deadline = started.checked_add(limits.time)?;
    // A defect in the converter must never break capture: any panic keeps the
    // plain text. Panic messages carry indices, never selected content.
    panic::catch_unwind(AssertUnwindSafe(|| {
        let dom = dom::parse(html, limits.nodes, limits.depth, deadline)?;
        markdown::render(&dom, plain, limits, deadline)
    }))
    .ok()
    .flatten()
}

/// The converter with a generous time budget, so tests on a loaded machine
/// observe the deterministic result rather than the time bound.
#[cfg(test)]
pub(crate) fn html_to_markdown_untimed(html: &[u8], plain: &str) -> Option<String> {
    convert(
        html,
        plain,
        &Limits {
            time: Duration::from_secs(60),
            ..LIMITS
        },
    )
}

#[cfg(test)]
mod tests;
