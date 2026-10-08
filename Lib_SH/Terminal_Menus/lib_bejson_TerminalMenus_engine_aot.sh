# -----------------------------------------------------------------------------
# Library:         lib_bejson_TerminalMenus_engine_aot.sh
# Family:          Terminal_Menus
# Module Purpose:  Terminal_Menus AOT (Ahead-Of-Time) runtime engine. Parses a
# Architecture:    BEJSON 104db provides single-file multi-entity relational storage with positional null-padding, Record_Type_Parent discriminator headers, and plain-text LLM readability.
# Version:         0.1.0
# Release_Version: 300
# Date:            2026-07-23
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   3bc7c1e3-023f-4573-a550-c43ba268e08f
# -----------------------------------------------------------------------------

set -o pipefail

# --- Portability: self-locate, never hardcode paths (System Development Policy 3.7/3.8) ---
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

# --- Configurable input: first argument, else TERMINAL_MENUS_BEJSON_FILE env var, else default ---
BEJSON_FILE="${1:-${TERMINAL_MENUS_BEJSON_FILE:-menus.bejson}}"

terminal_menus_engine_check_deps() {
    if ! command -v jq &> /dev/null; then
        echo "Error [E_TM_JQ_NOT_FOUND=${E_TM_JQ_NOT_FOUND}]: jq is required for the AOT Runtime Engine." >&2
        exit "${E_TM_JQ_NOT_FOUND}"
    fi
    if [[ ! -f "$BEJSON_FILE" ]]; then
        echo "Error [E_TM_BEJSON_NOT_FOUND=${E_TM_BEJSON_NOT_FOUND}]: '$BEJSON_FILE' not found." >&2
        exit "${E_TM_BEJSON_NOT_FOUND}"
    fi
}

terminal_menus_engine_load() {
    # Declare native Bash associative arrays for state management (global scope)
    declare -gA STATE_TITLE STATE_ON_ENTER STATE_ON_EXIT
    declare -gA INPUT_PROMPT INPUT_VAR INPUT_ACTION INPUT_POINTER

    # Pre-evaluate Code Blocks (MenuCodeBlock.raw_code, field index 4)
    eval "$(jq -r '.Values[] | select(.[0]=="MenuCodeBlock") | .[4]' "$BEJSON_FILE")"

    ENTRY_ADDRESS=$(jq -r '.Values[] | select(.[0]=="MenuSystem") | .[2]' "$BEJSON_FILE")
    if [[ -z "$ENTRY_ADDRESS" || "$ENTRY_ADDRESS" == "null" ]]; then
        echo "Error [E_TM_NO_ENTRY_ADDRESS=${E_TM_NO_ENTRY_ADDRESS}]: MenuSystem.entry_address missing." >&2
        exit "${E_TM_NO_ENTRY_ADDRESS}"
    fi

    # Load Standard States: address_id(5) title(6) on_enter(7) on_exit(8)
    while IFS=$'\t' read -r id title enter exit_hook; do
        STATE_TITLE["$id"]="$title"
        STATE_ON_ENTER["$id"]="$enter"
        STATE_ON_EXIT["$id"]="$exit_hook"
    done < <(jq -r '.Values[] | select(.[0]=="MenuState") | "\(.[5])\t\(.[6])\t\(.[7])\t\(.[8])"' "$BEJSON_FILE")

    # Load Input States: address_id(5) prompt(9) var_name(10) action_bash(14) pointer_id(15)
    while IFS=$'\t' read -r id prompt var action pointer; do
        INPUT_PROMPT["$id"]="$prompt"
        INPUT_VAR["$id"]="$var"
        INPUT_ACTION["$id"]="$action"
        INPUT_POINTER["$id"]="$pointer"
    done < <(jq -r '.Values[] | select(.[0]=="MenuInput") | "\(.[5])\t\(.[9])\t\(.[10])\t\(.[14])\t\(.[15])"' "$BEJSON_FILE")
}

terminal_menus_run() {
    local current_address="$ENTRY_ADDRESS"

    while true; do
        if [[ -z "${STATE_TITLE[$current_address]+x}" && -z "${INPUT_VAR[$current_address]+x}" ]]; then
            echo "Error [E_TM_ADDRESS_NOT_FOUND=${E_TM_ADDRESS_NOT_FOUND}]: address '$current_address' has no MenuState or MenuInput." >&2
            exit "${E_TM_ADDRESS_NOT_FOUND}"
        fi

        # 1. Execute on_enter hook if it exists
        [[ -n "${STATE_ON_ENTER[$current_address]}" && "${STATE_ON_ENTER[$current_address]}" != "null" ]] && \
            eval "${STATE_ON_ENTER[$current_address]}"

        # 2. Check if Current Address is an Input State
        if [[ -n "${INPUT_VAR[$current_address]+x}" ]]; then
            clear
            read -r -p "${INPUT_PROMPT[$current_address]}" "${INPUT_VAR[$current_address]}"
            [[ "${INPUT_ACTION[$current_address]}" != "null" ]] && eval "${INPUT_ACTION[$current_address]}"
            current_address="${INPUT_POINTER[$current_address]}"
            continue
        fi

        # 3. Render Standard MenuState
        clear
        echo "======================================"
        echo "   ${STATE_TITLE[$current_address]}   "
        echo "======================================"

        local valid_keys=() actions=() pointers=()

        # MenuOption fields: parent_address_id(11) key(12) label(13) action_bash(14) pointer_id(15) show_if(16)
        while IFS=$'\t' read -r key label action pointer show_if; do
            if [[ "$show_if" != "null" ]]; then
                eval "$show_if" || continue
            fi
            valid_keys+=("$key")
            actions+=("$action")
            pointers+=("$pointer")
            echo " [$key] $label"
        done < <(jq -r --arg addr "$current_address" \
            '.Values[] | select(.[0]=="MenuOption" and .[11]==$addr) | "\(.[12])\t\(.[13])\t\(.[14])\t\(.[15])\t\(.[16])"' \
            "$BEJSON_FILE")

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

# Only auto-run when executed directly, not when sourced by another script/library
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    terminal_menus_engine_check_deps
    terminal_menus_engine_load
    terminal_menus_run
fi