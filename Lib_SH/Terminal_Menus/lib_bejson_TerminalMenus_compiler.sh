# -----------------------------------------------------------------------------
# Library:         lib_bejson_TerminalMenus_compiler.sh
# Family:          Terminal_Menus
# Module Purpose:  Terminal_Menus standalone compiler. Translates a BEJSON
# Architecture:    BEJSON 104db provides single-file multi-entity relational storage with positional null-padding, Record_Type_Parent discriminator headers, and plain-text LLM readability.
# Version:         0.1.0
# Release_Version: 300
# Date:            2026-07-23
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   38792b17-f340-4ac0-a6d9-5b29a032305f
# -----------------------------------------------------------------------------

set -o pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# FIX (LIB-SH-M1): was `[[ -f "..." ]] && source "..."` - if the
# adjacent errors file was missing, sourcing was silently skipped with
# zero output, and any E_* error code referenced later in this script
# would silently become an undefined/empty variable instead of a
# clear failure. Now fails loudly instead.
if [[ ! -f "${SCRIPT_PATH}/lib_bejson_TerminalMenus_bejson_errors.sh" ]]; then
    echo "ERROR: required dependency not found: ${SCRIPT_PATH}/lib_bejson_TerminalMenus_bejson_errors.sh" >&2
    return 1 2>/dev/null || exit 1
fi
source "${SCRIPT_PATH}/lib_bejson_TerminalMenus_bejson_errors.sh"

BEJSON_FILE="${1:-${TERMINAL_MENUS_BEJSON_FILE:-menus.bejson}}"
OUTPUT_FILE="${2:-terminal_menu_compiled.sh}"

terminal_menus_compiler_check_deps() {
    if ! command -v jq &> /dev/null; then
        echo "Error [E_TM_JQ_NOT_FOUND=${E_TM_JQ_NOT_FOUND}]: jq is required to run the compiler." >&2
        exit "${E_TM_JQ_NOT_FOUND}"
    fi
    if [[ ! -f "$BEJSON_FILE" ]]; then
        echo "Error [E_TM_BEJSON_NOT_FOUND=${E_TM_BEJSON_NOT_FOUND}]: '$BEJSON_FILE' not found." >&2
        exit "${E_TM_BEJSON_NOT_FOUND}"
    fi
    local records_type
    records_type=$(jq -r '.Records_Type | index("MenuSystem")' "$BEJSON_FILE" 2>/dev/null)
    if [[ "$records_type" == "null" || -z "$records_type" ]]; then
        echo "Error [E_TM_INVALID_MENU_SCHEMA=${E_TM_INVALID_MENU_SCHEMA}]: '$BEJSON_FILE' has no MenuSystem record type." >&2
        exit "${E_TM_INVALID_MENU_SCHEMA}"
    fi
}

# Emits: <bash_array_name>["<key>"]="<escaped_value>"
_tm_emit_assoc() {
    local array_name="$1" key="$2" value="$3"
    printf '%s[%q]=%q\n' "$array_name" "$key" "$value"
}

terminal_menus_compile() {
    {
        echo "#!/bin/bash"
        echo "# Compiled by lib_bejson_TerminalMenus_compiler.sh from: ${BEJSON_FILE}"
        echo "# Terminal_Menus — dependency-free compiled menu (no jq required)."
        echo "# Format_Creator: Elton Boehnen | github.com/boehnenelton"
        echo "set -o pipefail"
        echo
        echo "declare -A STATE_TITLE STATE_ON_ENTER STATE_ON_EXIT"
        echo "declare -A INPUT_PROMPT INPUT_VAR INPUT_ACTION INPUT_POINTER"
        echo "OPTION_ADDR=(); OPTION_KEY=(); OPTION_LABEL=(); OPTION_ACTION=(); OPTION_POINTER=(); OPTION_SHOWIF=()"
        echo

        # --- Code Blocks: raw_code (index 4) inserted verbatim as real functions ---
        jq -r '.Values[] | select(.[0]=="MenuCodeBlock") | .[4]' "$BEJSON_FILE"
        echo

        # --- Entry address ---
        local entry_address
        entry_address=$(jq -r '.Values[] | select(.[0]=="MenuSystem") | .[2]' "$BEJSON_FILE")
        if [[ -z "$entry_address" || "$entry_address" == "null" ]]; then
            echo "Error [E_TM_NO_ENTRY_ADDRESS=${E_TM_NO_ENTRY_ADDRESS}]: MenuSystem.entry_address missing." >&2
            return "${E_TM_NO_ENTRY_ADDRESS}"
        fi
        printf 'ENTRY_ADDRESS=%q\n\n' "$entry_address"

        # --- MenuState: address_id(5) title(6) on_enter(7) on_exit(8) ---
        while IFS=$'\t' read -r id title enter exit_hook; do
            _tm_emit_assoc STATE_TITLE "$id" "$title"
            _tm_emit_assoc STATE_ON_ENTER "$id" "$enter"
            _tm_emit_assoc STATE_ON_EXIT "$id" "$exit_hook"
        done < <(jq -r '.Values[] | select(.[0]=="MenuState") | "\(.[5])\t\(.[6])\t\(.[7])\t\(.[8])"' "$BEJSON_FILE")
        echo

        # --- MenuInput: address_id(5) prompt(9) var_name(10) action_bash(14) pointer_id(15) ---
        while IFS=$'\t' read -r id prompt var action pointer; do
            _tm_emit_assoc INPUT_PROMPT "$id" "$prompt"
            _tm_emit_assoc INPUT_VAR "$id" "$var"
            _tm_emit_assoc INPUT_ACTION "$id" "$action"
            _tm_emit_assoc INPUT_POINTER "$id" "$pointer"
        done < <(jq -r '.Values[] | select(.[0]=="MenuInput") | "\(.[5])\t\(.[9])\t\(.[10])\t\(.[14])\t\(.[15])"' "$BEJSON_FILE")
        echo

        # --- MenuOption: parent_address_id(11) key(12) label(13) action_bash(14) pointer_id(15) show_if(16) ---
        while IFS=$'\t' read -r addr key label action pointer show_if; do
            printf 'OPTION_ADDR+=(%q); OPTION_KEY+=(%q); OPTION_LABEL+=(%q); OPTION_ACTION+=(%q); OPTION_POINTER+=(%q); OPTION_SHOWIF+=(%q)\n' \
                "$addr" "$key" "$label" "$action" "$pointer" "$show_if"
        done < <(jq -r '.Values[] | select(.[0]=="MenuOption") | "\(.[11])\t\(.[12])\t\(.[13])\t\(.[14])\t\(.[15])\t\(.[16])"' "$BEJSON_FILE")
        echo

        # --- Dependency-free run loop (no jq calls) ---
        cat <<'RUNTIME_EOF'
terminal_menus_run() {
    local current_address="$ENTRY_ADDRESS"

    while true; do
        [[ -n "${STATE_ON_ENTER[$current_address]}" && "${STATE_ON_ENTER[$current_address]}" != "null" ]] && \
            eval "${STATE_ON_ENTER[$current_address]}"

        if [[ -n "${INPUT_VAR[$current_address]+x}" ]]; then
            clear
            read -r -p "${INPUT_PROMPT[$current_address]}" "${INPUT_VAR[$current_address]}"
            [[ "${INPUT_ACTION[$current_address]}" != "null" ]] && eval "${INPUT_ACTION[$current_address]}"
            current_address="${INPUT_POINTER[$current_address]}"
            continue
        fi

        clear
        echo "======================================"
        echo "   ${STATE_TITLE[$current_address]}   "
        echo "======================================"

        local valid_keys=() actions=() pointers=()
        for i in "${!OPTION_ADDR[@]}"; do
            [[ "${OPTION_ADDR[$i]}" == "$current_address" ]] || continue
            if [[ "${OPTION_SHOWIF[$i]}" != "null" ]]; then
                eval "${OPTION_SHOWIF[$i]}" || continue
            fi
            valid_keys+=("${OPTION_KEY[$i]}")
            actions+=("${OPTION_ACTION[$i]}")
            pointers+=("${OPTION_POINTER[$i]}")
            echo " [${OPTION_KEY[$i]}] ${OPTION_LABEL[$i]}"
        done

        echo "======================================"
        read -r -p "Select: " choice

        local choice_valid=false
        for i in "${!valid_keys[@]}"; do
            if [[ "${valid_keys[$i]}" == "$choice" ]]; then
                choice_valid=true
                [[ "${STATE_ON_EXIT[$current_address]}" != "null" ]] && eval "${STATE_ON_EXIT[$current_address]}"

                if [[ "${actions[$i]}" != "null" ]]; then
                    echo "--- Executing ---"
                    eval "${actions[$i]}"
                fi

                if [[ "${pointers[$i]}" == "EXIT" ]]; then
                    exit 0
                fi

                current_address="${pointers[$i]}"
                break
            fi
        done

        if [[ "$choice_valid" == false ]]; then
            echo "Invalid option."
            sleep 1
        fi
    done
}

terminal_menus_run
RUNTIME_EOF
    } > "$OUTPUT_FILE"

    if [[ ! -s "$OUTPUT_FILE" ]]; then
        echo "Error [E_TM_COMPILE_WRITE_FAILED=${E_TM_COMPILE_WRITE_FAILED}]: failed to write '$OUTPUT_FILE'." >&2
        exit "${E_TM_COMPILE_WRITE_FAILED}"
    fi
    chmod +x "$OUTPUT_FILE"
    echo "Compiled: $OUTPUT_FILE"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    terminal_menus_compiler_check_deps
    terminal_menus_compile
fi