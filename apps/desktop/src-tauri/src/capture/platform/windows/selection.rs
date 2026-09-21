use crate::capture::platform::bounded::{MAX_SELECTION_BYTES, SELECTION_TIMEOUT};
use std::time::Instant;
use windows::Win32::{
    Foundation::HWND,
    System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    },
    UI::{
        Accessibility::{
            CUIAutomation8, IUIAutomation2, IUIAutomationTextPattern, UIA_TextPatternId,
        },
        WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
    },
};

pub fn read(source: usize) -> Option<String> {
    if source == 0 {
        return None;
    }
    unsafe {
        if GetForegroundWindow().0 as usize != source {
            return None;
        }
        CoInitializeEx(None, COINIT_MULTITHREADED).ok().ok()?;
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        let _apartment = Apartment;
        let started = Instant::now();
        let automation: IUIAutomation2 =
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok()?;
        automation.SetAutoSetFocus(false).ok()?;
        automation.SetConnectionTimeout(150).ok()?;
        automation.SetTransactionTimeout(150).ok()?;
        let focused = automation.GetFocusedElement().ok()?;
        let mut element = focused.clone();
        let walker = automation.ControlViewWalker().ok()?;
        let mut pid = 0;
        GetWindowThreadProcessId(HWND(source as *mut _), Some(&mut pid));
        for _ in 0..32 {
            if started.elapsed() >= SELECTION_TIMEOUT
                || element.CurrentIsPassword().ok()?.as_bool()
                || element.CurrentProcessId().ok()? as u32 != pid
            {
                return None;
            }
            if let Ok(pattern) =
                element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
            {
                let ranges = pattern.GetSelection().ok()?;
                // Multiple disjoint ranges have no unambiguous Markdown ordering.
                if ranges.Length().ok()? != 1 {
                    return None;
                }
                let text = ranges
                    .GetElement(0)
                    .ok()?
                    .GetText((MAX_SELECTION_BYTES / 4 + 1) as i32)
                    .ok()?;
                if text.len() > MAX_SELECTION_BYTES / 4 {
                    return None;
                }
                let text = String::from_utf16(&text).ok()?;
                let current = automation.GetFocusedElement().ok()?;
                if started.elapsed() >= SELECTION_TIMEOUT
                    || GetForegroundWindow().0 as usize != source
                    || !automation
                        .CompareElements(&focused, &current)
                        .ok()?
                        .as_bool()
                {
                    return None;
                }
                return Some(text);
            }
            element = walker.GetParentElement(&element).ok()?;
        }
        None
    }
}
