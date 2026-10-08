"""
Library:         __init__.py
Family:          Core_Extension
Module Purpose:  Package entry point for the Core_Extension family — new Core-adjacent capabilities that don't belong inside the immutable Core family itself. Every module here is additive, built entirely on Core's public API, never on its internals.
Architecture:    BEJSON Core provides foundational format parsing, schema enforcement, path security, positional field map caching, and multi-format integration across runtime environments.
Version:         1.0.0
Release_Version: 300
Date:            2026-08-09
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   c0726254-ac75-4222-8351-0661fe661ea7
"""

# This package's public API is exposed by its constituent modules.
# Import directly from the relevant submodule, e.g.:
#   from lib_bejson_CoreExtension_bejson_pagecache import bejson_pagecache_get_page