use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition};

use super::{CaptureError, CaptureRequest, CaptureWindowPort};

pub struct TauriCaptureWindow {
    app: AppHandle,
}

impl TauriCaptureWindow {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn window(&self) -> Result<tauri::WebviewWindow, CaptureError> {
        self.app
            .get_webview_window("capture")
            .ok_or(CaptureError::WindowUnavailable)
    }

    fn position_on_active_monitor(
        &self,
        window: &tauri::WebviewWindow,
        height: f64,
    ) -> tauri::Result<()> {
        let cursor = self.app.cursor_position()?;
        let Some(monitor) = self.app.monitor_from_point(cursor.x, cursor.y)? else {
            return window.center();
        };
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = (560.0 * scale).round() as i32;
        let height = (height * scale).round() as i32;
        let x = work_area.position.x + (work_area.size.width as i32 - width).max(0) / 2;
        let y = work_area.position.y + (work_area.size.height as i32 - height).max(0) / 2;
        window.set_position(PhysicalPosition::new(x, y))
    }
}

impl CaptureWindowPort for TauriCaptureWindow {
    fn open(&mut self, request: &CaptureRequest) -> Result<(), CaptureError> {
        let window = self.window()?;
        window
            .emit("capture://requested", request)
            .map_err(|_| CaptureError::WindowUnavailable)?;
        let height = capture_height(&request.prefill);
        window
            .set_size(LogicalSize::new(560.0, height))
            .and_then(|()| self.position_on_active_monitor(&window, height))
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus())
            .map_err(|_| CaptureError::WindowUnavailable)
    }

    fn focus(&mut self) -> Result<(), CaptureError> {
        let window = self.window()?;
        window
            .show()
            .and_then(|()| window.set_focus())
            .map_err(|_| CaptureError::WindowUnavailable)
    }

    fn hide(&mut self) -> Result<(), CaptureError> {
        self.window()?
            .hide()
            .map_err(|_| CaptureError::WindowUnavailable)
    }

    fn shutdown(&mut self) {
        if let Some(window) = self.app.get_webview_window("capture") {
            let _ = window.hide();
        }
    }
}

fn capture_height(prefill: &str) -> f64 {
    const TEXT_COLUMNS: usize = 72;
    let visual_lines = prefill
        .lines()
        .map(|line| line.chars().count().max(1).div_ceil(TEXT_COLUMNS))
        .sum::<usize>()
        .max(1);
    (360.0 + visual_lines.min(12) as f64 * 20.0).clamp(380.0, 640.0)
}

#[cfg(test)]
mod tests {
    use super::capture_height;

    #[test]
    fn capture_height_tracks_draft_content_with_native_bounds() {
        assert_eq!(capture_height(""), 380.0);
        assert!(capture_height("one\ntwo\nthree\nfour") > capture_height("one"));
        assert_eq!(capture_height(&"line\n".repeat(100)), 600.0);
    }
}
