use askama::Template;

/// Render a template to an owned String, logging to stderr and substituting
/// empty content if the render fails.
pub(crate) fn render_template<T: Template>(template: &T) -> String {
    template.render().unwrap_or_else(|e| {
        eprintln!("template render failed: {e}");
        String::new()
    })
}

/// Render a template directly into `out`, logging to stderr if the render
/// fails.
pub(crate) fn render_template_into<T: Template>(template: &T, out: &mut String) {
    if let Err(e) = template.render_into(out) {
        eprintln!("template render failed: {e}");
    }
}
