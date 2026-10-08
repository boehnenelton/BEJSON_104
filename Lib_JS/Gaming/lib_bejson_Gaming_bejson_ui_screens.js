/**
 * Library:         lib_bejson_Gaming_bejson_ui_screens.js
 * Family:          Gaming
 * Module Purpose:  UI state and layout manager for BEJSON applications.
 * Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
 * Version:         2.0.2
 * Release_Version: 300
 * Date:            2026-06-20
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   9ca7a95e-ed95-4ed5-a421-e495a6d0d58f
 */

// FIX (LIB-GAME-M1): this file reads/writes window.BEJSON_Switch as an
// ambient global (set by lib_bejson_Core_bejson_bejson.js), with no
// import establishing that dependency. Under real ES-module loading
// (this file's own consumers use `import ... from`, see cli/game.js)
// there is no guarantee that script ran first - a side-effect import
// forces it to execute before this module's own top-level code runs,
// while leaving the window.BEJSON_Switch assignment below intact for
// plain <script>-tag usage.
import '../Core/lib_bejson_Core_bejson_bejson.js';

window.Core = window.Core || {};

class SwitchUIScreens {
    constructor(renderer) {
        this.renderer = renderer;
        this.activeScreen = null;
        this.screens = BEJSON_Switch.BEJSON.create104("UIScreens", [
            { name: "id", type: "string" },
            { name: "title", type: "string" },
            { name: "options", type: "array" }
        ], [
            ["START_SCREEN", "SWITCH RPG", ["Start Game", "Load Game", "Options", "Exit"]],
            ["SAVE_MENU", "SAVE GAME", ["Slot 1", "Slot 2", "Slot 3", "Back"]]
        ]);
        
        this.selectedIndex = 0;
    }

    show(id) {
        this.activeScreen = this.screens.Values.find(v => v[0] === id);
        this.selectedIndex = 0;
    }

    render() {
        if (!this.activeScreen) return;

        const [id, title, options] = this.activeScreen;
        const canvas = this.renderer.canvas;
        const dpr = this.renderer.dpr;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        // Dim Background
        this.renderer.drawRect(0, 0, w, h, "rgba(0,0,0,0.8)", true);

        // Title
        this.renderer.drawText(title, w / 2 - 50, h / 4, { 
            font: "bold 24px sans-serif", 
            isHUD: true,
            color: "#3b82f6"
        });

        // Options
        options.forEach((opt, i) => {
            const isSelected = i === this.selectedIndex;
            const color = isSelected ? "#fff" : "#666";
            const prefix = isSelected ? "> " : "  ";
            this.renderer.drawText(prefix + opt, w / 2 - 40, h / 2 + (i * 30), { 
                font: "18px sans-serif", 
                isHUD: true,
                color: color
            });
        });
    }

    navigate(dir) {
        if (!this.activeScreen) return;
        const options = this.activeScreen[2];
        this.selectedIndex = (this.selectedIndex + dir + options.length) % options.length;
    }

    getSelectedOption() {
        if (!this.activeScreen) return null;
        return this.activeScreen[2][this.selectedIndex];
    }
}

BEJSON_Switch.UIScreens = SwitchUIScreens;
export default SwitchUIScreens;
export { SwitchUIScreens };