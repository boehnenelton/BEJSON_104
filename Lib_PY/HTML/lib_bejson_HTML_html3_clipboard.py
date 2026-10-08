"""
Library:         lib_bejson_HTML_html3_clipboard.py
Family:          HTML
Module Purpose:  Implements runtime functionality and logic for lib_bejson_HTML_html3_clipboard.py.
Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
Version:         3.0.0
Release_Version: 300
Date:            2026-05-29
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   9039ef12-b8b7-4e1f-8970-0a2f628b57d7
"""

VERSION = "3.0.0"
SCRIPT_NAME = "lib_bejson_HTML_html3_clipboard.py"
RELATIONAL_ID = "d2e1f0c4-7b8a-46be-8707-ea13b43afcab"

CLIPBOARD_JS = """
/* HTML3 Shared Clipboard Utility (ES5 Safe) */
(function() {
    if (typeof window.bejsonCopy === 'function') return;
    
    window.bejsonCopy = function(id, btn) {
        var el = document.getElementById(id);
        if (!el) return;
        
        var text = el.innerText || el.textContent;
        var originalLabel = btn ? btn.innerText : 'COPY';
        
        function feedback() {
            if (!btn) return;
            btn.innerText = 'COPIED!';
            setTimeout(function() { btn.innerText = originalLabel; }, 2000);
        }

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function() {
                feedback();
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                var successful = document.execCommand('copy');
                if (successful) feedback();
            } catch (err) {
                console.error('HTML3 Clipboard: Fallback copy failed', err);
            }
            document.body.removeChild(ta);
        }
    };
})();
"""

def get_clipboard_js():
    """Returns the shared clipboard JavaScript block."""
    return f"<script>{CLIPBOARD_JS}</script>"