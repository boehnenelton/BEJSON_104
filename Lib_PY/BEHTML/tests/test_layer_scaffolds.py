#!/usr/bin/env python3
"""
Test Suite:      test_layer_scaffolds.py
Purpose:         Validates BEHTML Layer 1 through 4 Scaffolds and Compositor.
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Date Created:    2026-10-24
RELATIONAL_ID:   543f2a1b-9e8d-4c7b-a01f-2b3c4d5e6f70
"""

import os
import sys
import unittest
from pathlib import Path

# Add BEHTML module directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BEHTML_DIR = SCRIPT_DIR.parent
if str(BEHTML_DIR) not in sys.path:
    sys.path.insert(0, str(BEHTML_DIR))

import lib_bejson_BEHTML_bootstrap  # noqa: F401

from lib_bejson_BEHTML_layer_1_scaffold import (
    behtml_layer_1_scaffold_page,
    behtml_layer_1_get_viewport_sync_script,
    BEHTML_LAYER_1_Z_INDEX
)
from lib_bejson_BEHTML_layer_2_scaffold import (
    behtml_layer_2_scaffold_table,
    behtml_layer_2_scaffold_kpi_card,
    behtml_layer_2_scaffold_toolbar,
    BEHTML_LAYER_2_DEFAULT_Z_INDEX
)
from lib_bejson_BEHTML_layer_3_scaffold import (
    behtml_layer_3_scaffold_modal,
    behtml_layer_3_scaffold_flyout,
    behtml_layer_3_scaffold_inspector_hud,
    BEHTML_LAYER_3_Z_INDEX
)
from lib_bejson_BEHTML_layer_4_scaffold import (
    behtml_layer_4_scaffold_header_bar,
    behtml_layer_4_scaffold_sidebar_drawer,
    behtml_layer_4_scaffold_brand_badge,
    behtml_layer_4_scaffold_telemetry_strip,
    BEHTML_LAYER_4_Z_INDEX
)
from lib_bejson_BEHTML_layer_scaffolds import behtml_compose_application_page


class TestBEHTMLLayerScaffolds(unittest.TestCase):

    def test_layer_1_scaffold(self):
        page_html = behtml_layer_1_scaffold_page(
            page_title_text="Layer 1 Test",
            body_content_markup="<div>Content</div>",
            theme_palette_name="dark",
            grid_mode_type="16_sublane",
            is_debug_mode=False
        )
        self.assertIn("<!DOCTYPE html>", page_html)
        self.assertIn("var(--app-height)", page_html)
        self.assertIn("window.visualViewport", page_html)
        self.assertIn(f"z-index: {BEHTML_LAYER_1_Z_INDEX};", page_html)
        self.assertIn("#000000", page_html)
        self.assertIn("#DE2626", page_html)

    def test_layer_2_scaffold(self):
        table_html = behtml_layer_2_scaffold_table(
            table_element_id="test-table",
            column_x_start_index=0,
            column_x_span_count=8,
            row_y_start_index=0,
            row_y_span_count=4,
            column_fields_roster=["ID", "Name", "Status"],
            records_values_matrix=[
                ["001", "Module Alpha", "Active"],
                ["002", "Module Beta", "Active"]
            ],
            table_title_text="System Ledger"
        )
        self.assertIn('id="test-table"', table_html)
        self.assertIn(f"z-index: {BEHTML_LAYER_2_DEFAULT_Z_INDEX};", table_html)
        self.assertIn("grid-column: 1 / span 8;", table_html)
        self.assertIn("grid-row: 1 / span 4;", table_html)
        self.assertIn("Module Alpha", table_html)

        kpi_html = behtml_layer_2_scaffold_kpi_card(
            card_element_id="test-kpi",
            column_x_start_index=8,
            column_x_span_count=4,
            row_y_start_index=0,
            row_y_span_count=3,
            card_title_text="Throughput",
            metric_value_text="1,048 ops/s",
            delta_caption_text="+12.4% vs last cycle"
        )
        self.assertIn("Throughput", kpi_html)
        self.assertIn("1,048 ops/s", kpi_html)

    def test_layer_3_scaffold(self):
        modal_html = behtml_layer_3_scaffold_modal(
            modal_element_id="test-modal",
            modal_title_text="Warning Action",
            modal_body_html="<p>Confirm action execution.</p>",
            action_buttons_roster=[
                {"label": "Confirm", "is_primary": True},
                {"label": "Cancel", "is_primary": False}
            ]
        )
        self.assertIn('id="test-modal"', modal_html)
        self.assertIn(f"z-index: {BEHTML_LAYER_3_Z_INDEX};", modal_html)
        self.assertIn("#000000", modal_html)  # 100% Solid Occlusion
        self.assertIn("Confirm action execution.", modal_html)

    def test_layer_4_scaffold(self):
        header_html = behtml_layer_4_scaffold_header_bar(
            header_element_id="test-header",
            brand_title_text="BEHTML CORE",
            system_version_label="v1.0.0"
        )
        self.assertIn('id="test-header"', header_html)
        self.assertIn(f"z-index: {BEHTML_LAYER_4_Z_INDEX};", header_html)
        self.assertIn("height: 64px;", header_html)
        self.assertIn("BEHTML CORE", header_html)

        sidebar_html = behtml_layer_4_scaffold_sidebar_drawer(
            drawer_element_id="test-drawer",
            navigation_items_roster=[{"label": "Home", "href": "/", "is_active": True}]
        )
        self.assertIn('id="test-drawer"', sidebar_html)
        self.assertIn("Home", sidebar_html)

        telemetry_html = behtml_layer_4_scaffold_telemetry_strip(
            status_message_text="STATUS OK",
            is_operational_active=True
        )
        self.assertIn("STATUS OK", telemetry_html)
        self.assertIn("height: 32px;", telemetry_html)

    def test_full_application_composition(self):
        kpi_1 = behtml_layer_2_scaffold_kpi_card("kpi-1", 0, 4, 0, 3, "Total Entities", "48")
        kpi_2 = behtml_layer_2_scaffold_kpi_card("kpi-2", 4, 4, 0, 3, "Active Streams", "12")
        table_1 = behtml_layer_2_scaffold_table(
            "main-table", 0, 16, 3, 8,
            ["Record_GUID", "Target_Name", "Latency_MS"],
            [["guid-001", "Core_API", "1.4ms"], ["guid-002", "Storage_IO", "0.8ms"]],
            table_title_text="Active Telemetry"
        )
        modal_1 = behtml_layer_3_scaffold_modal("confirm-dialog", "Reset Storage", "<p>Reset cannot be undone.</p>", [{"label": "Execute Reset", "is_primary": True}])

        app_html = behtml_compose_application_page(
            page_title_text="Production App Suite",
            brand_title_text="ENTERPRISE CORE",
            system_version_label="v3.0.0",
            layer_2_surface_markup_roster=[kpi_1, kpi_2, table_1],
            layer_3_dialogues_markup_roster=[modal_1]
        )
        self.assertIn("ENTERPRISE CORE", app_html)
        self.assertIn("Total Entities", app_html)
        self.assertIn("Active Telemetry", app_html)
        self.assertIn("Reset Storage", app_html)
        self.assertIn("SYSTEM OPERATIONAL", app_html)


if __name__ == "__main__":
    unittest.main()
