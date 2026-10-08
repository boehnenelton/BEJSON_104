# -----------------------------------------------------------------------------
# Library:         lib_bejson_TerminalMenus_bejson_errors.sh
# Family:          Terminal_Menus
# Module Purpose:  Error registry for the Terminal_Menus family. Codes for
# Architecture:    BEJSON 104 Ecosystem Component maintaining strict schema integrity, field map caching, and standardized runtime contracts.
# Version:         2.1.0
# Release_Version: 300
# Date:            2026-08-15
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   8f2c1a9e-4d6b-4e3a-9c7f-1a0e5b3d2f88
# -----------------------------------------------------------------------------

[[ -n "${_LIB_BEJSON_TERMINAL_MENUS_ERRORS_LOADED:-}" ]] && return 0
readonly _LIB_BEJSON_TERMINAL_MENUS_ERRORS_LOADED=1

# ===========================================================================
# TERMINAL_MENUS (360-389)
# ===========================================================================
[[ -v E_TM_JQ_NOT_FOUND        ]] || readonly E_TM_JQ_NOT_FOUND=360
[[ -v E_TM_BEJSON_NOT_FOUND    ]] || readonly E_TM_BEJSON_NOT_FOUND=361
[[ -v E_TM_INVALID_MENU_SCHEMA ]] || readonly E_TM_INVALID_MENU_SCHEMA=362
[[ -v E_TM_NO_ENTRY_ADDRESS    ]] || readonly E_TM_NO_ENTRY_ADDRESS=363
[[ -v E_TM_ADDRESS_NOT_FOUND   ]] || readonly E_TM_ADDRESS_NOT_FOUND=364
[[ -v E_TM_COMPILE_WRITE_FAILED ]] || readonly E_TM_COMPILE_WRITE_FAILED=365
[[ -v E_TM_INVALID_POINTER     ]] || readonly E_TM_INVALID_POINTER=366

# 367-389 reserved for future Terminal_Menus codes.