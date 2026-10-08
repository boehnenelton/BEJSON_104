#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         lib_bejson_Animation_terminal_animator.sh
# Family:          Animation
# Module Purpose:  Execute frame-by-frame animated screens using BEJSON 104a (Revision 2).
# Version:         2.0.0
# Date:            2026-09-17
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# -----------------------------------------------------------------------------

set -o pipefail

# Safeties and Cleanup
_cleanup_animator() {
    # Ensure cursor is restored on exit or interrupt
    printf '\033[?25h'
}
trap _cleanup_animator EXIT INT TERM

# Core Animation Playback Function
play_bejson_animation() {
    local schema_file="$1"
    
    if [[ ! -f "$schema_file" ]]; then
        echo "Error: Schema file '$schema_file' not found."
        return 1
    fi
    
    # 1. Parse Schema Validation and Metadata
    local format format_version
    format=$(jq -r '.Format // empty' "$schema_file")
    format_version=$(jq -r '.Format_Version // empty' "$schema_file")
    
    if [[ "$format" != "BEJSON" || "$format_version" != "104a" ]]; then
        echo "Error: File is not a valid BEJSON 104a schema."
        return 1
    fi
    
    local loop_behavior req_lines clear_on_exit
    loop_behavior=$(jq -r '.Loop_Behavior // "terminate"' "$schema_file")
    req_lines=$(jq -r '.Required_Lines // 1' "$schema_file")
    clear_on_exit=$(jq -r '.Clear_On_Exit // false' "$schema_file")
    
    # 2. Dynamic Resolution Validation
    local term_lines term_cols
    term_lines=$(tput lines)
    term_cols=$(tput cols)
    
    if (( term_lines < req_lines )); then
        echo "Error: Terminal footprint insufficient. Requires $req_lines lines, but terminal has $term_lines."
        return 1
    fi
    
    # 3. Render Preparation
    # Pre-render frames into a memory array to avoid repetitive jq overhead during playback
    local frames=()
    local frame_data=""
    
    # Extract frames.
    # index 0 is frame_id (dropped)
    # index 1 is duration_sec (extracted as $dur)
    # index 2+ are lines (mapped nulls to empty strings)
    # We output: duration_sec \n line1 \n line2 ... \u0000
    while IFS= read -r -d $'\0' frame_data; do
        frames+=("$frame_data")
    done < <(jq -j '.Values[] | .[1] as $dur | .[2:] | map((. // "")) | ($dur|tostring) + "\n" + join("\n") + "\u0000"' "$schema_file")
    
    local num_frames=${#frames[@]}
    if (( num_frames == 0 )); then
        echo "Error: No frames found in schema."
        return 1
    fi
    
    printf '\033[?25l' # Disable cursor for visual optimization
    
    local current_idx=0
    local direction=1 # Utilized for ping-pong behavior
    
    # 4. Playback Loop
    while true; do
        local raw_frame="${frames[$current_idx]}"
        
        # Fast bash parameter expansion to separate duration from lines
        local sleep_time="${raw_frame%%$'\n'*}"
        local lines_content="${raw_frame#*$'\n'}"
        
        # Return cursor to absolute top-left coordinate to prevent tearing
        printf '\033[H'
        
        # Render the frame, utilizing ANSI \033[K to clear to the end of each line
        local line_num=0
        while IFS= read -r line; do
            printf "%s\033[K\n" "$line"
            ((line_num++))
        done <<< "$lines_content"
        
        # If the frame data provided fewer lines than Required_Lines, overwrite the remaining vertically
        while (( line_num < req_lines )); do
            printf "\033[K\n"
            ((line_num++))
        done
        
        # Active Monitoring for User Interrupt (q or Esc) using the per-frame duration
        local key=""
        if read -r -s -t "$sleep_time" -n 1 key; then
            if [[ "$key" == "q" || "$key" == $'\e' ]]; then
                break
            fi
        fi
        
        # Update index based on Loop_Behavior
        if [[ "$loop_behavior" == "infinite" || "$loop_behavior" == "loop-infinite" ]]; then
            ((current_idx++))
            if (( current_idx >= num_frames )); then
                current_idx=0
            fi
        elif [[ "$loop_behavior" == "ping-pong" ]]; then
            ((current_idx += direction))
            if (( current_idx >= num_frames - 1 )); then
                current_idx=$((num_frames - 1))
                direction=-1
            elif (( current_idx <= 0 )); then
                current_idx=0
                direction=1
            fi
        else
            # "terminate" mode
            ((current_idx++))
            if (( current_idx >= num_frames )); then
                break
            fi
        fi
    done
    
    # 5. Cleanup Protocol
    if [[ "$clear_on_exit" == "true" ]]; then
        printf '\033[2J\033[H'
    fi
    
    # Cursor restoration is handled by trap
    return 0
}
