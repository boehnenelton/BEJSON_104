#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Library:         test_list_validator.sh
# Family:          Lists
# Module Purpose:  Tests for lib_bejson_Lists_list_validator.sh (bejson_lists_validate, bejson_lists_validate_field).
# Architecture:    Standalone bash script; resolves Lists relative to this file, uses mktemp (no absolute paths).
# Format_Scope:    104 | 104a (list-shaped documents)
# Version:         1.0.0
# Release_Version: 300
# Date:            2026-10-13
# Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
# Format_Creator:  Elton Boehnen
# RELATIONAL_ID:   50f20f5a-4e16-4ca1-91bd-853651a7f402
# -----------------------------------------------------------------------------

_T_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_T_DIR/../lib_bejson_Lists_list_validator.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0

mk() {  # name version rows-json [idtype]
    local t="${4:-string}"
    cat > "$TMP/$1.bejson" <<JSON
{"Format":"BEJSON","Format_Version":"$2","Format_Creator":"Elton Boehnen","Records_Type":["Category"],
 "Fields":[{"name":"id","type":"$t"},{"name":"parent_id","type":"$t"},{"name":"label","type":"string"}],
 "Values":$3}
JSON
}
mkf() {  # name rows-json
    cat > "$TMP/$1.bejson" <<JSON
{"Format":"BEJSON","Format_Version":"104a","Format_Creator":"Elton Boehnen","Records_Type":["T"],
 "Fields":[{"name":"tags","type":"array"}],"Values":$2}
JSON
}
run()  { bejson_lists_validate "$1" 2>/dev/null; RC=$?; CODES=" ${BEJSON_LISTS_CODES[*]} "; }
runf() { bejson_lists_validate_field "$1" "$2" "$3" 2>/dev/null; RC=$?; CODES=" ${BEJSON_LISTS_CODES[*]} "; }
check() { if [[ "$2" == "ok" ]]; then PASS=$((PASS+1)); echo "ok   - $1"; else FAIL=$((FAIL+1)); echo "FAIL - $1 (rc=$RC codes=$CODES)"; fi; }
has() { [[ "$CODES" == *" $1 "* ]] && echo ok || echo no; }
once() { [[ $(grep -o " $1 " <<< "$CODES" | wc -l) -eq 1 ]] && echo ok || echo no; }

TREE='[["a",null,"A"],["b","a","B"],["c","b","C"],["d","","D"]]'

mk tree 104a "$TREE"; run "$TMP/tree.bejson"
check "valid tree" "$([[ $RC -eq 0 ]] && echo ok)"
check "stats" "$([[ "$BEJSON_LISTS_STATS" == '{"item_count":4,"root_count":2,"max_depth":2}' ]] && echo ok)"
mk tree104 104 "$TREE"; run "$TMP/tree104.bejson"; check "104 accepted (old SH returned 4 for 104)" "$([[ $RC -eq 0 ]] && echo ok)"
mk empty 104a '[]'; run "$TMP/empty.bejson"; check "empty Values valid" "$([[ $RC -eq 0 ]] && echo ok)"

mk dup 104a '[["a",null,"A"],["a",null,"dup"]]'; run "$TMP/dup.bejson"; check "duplicate id" "$(has "$E_LISTS_DUPLICATE_ID")"
check "failure returns 1, real code in array" "$([[ $RC -eq 1 && ${BEJSON_LISTS_CODES[0]} -eq 485 ]] && echo ok)"
mk orph 104a '[["a","zzz","A"]]'; run "$TMP/orph.bejson"; check "orphan" "$(has "$E_LISTS_ORPHAN")"
mk cyc 104a '[["a","b","A"],["b","a","B"]]'; run "$TMP/cyc.bejson"; check "cycle reported once" "$(once "$E_LISTS_CYCLE")"
mk selfp 104a '[["a","a","A"]]'; run "$TMP/selfp.bejson"; check "self-parent is a cycle" "$(has "$E_LISTS_CYCLE")"
mk tail 104a '[["a","b","A"],["b","a","B"],["c","a","C"],["d","c","D"]]'; run "$TMP/tail.bejson"; check "tail off a cycle reports once" "$(once "$E_LISTS_CYCLE")"
mk multi 104a '[["a","zzz","A"],["a",null,"dup"],[null,null,"n"]]'; run "$TMP/multi.bejson"
check "all errors reported" "$([[ ${#BEJSON_LISTS_CODES[@]} -ge 3 ]] && echo ok)"
mk nullid 104a '[[null,null,"x"]]'; run "$TMP/nullid.bejson"; check "null id" "$(has "$E_LISTS_NULL_ID")"
mk zero 104a '[[0,null,"root"],[1,0,"kid"]]' integer; run "$TMP/zero.bejson"
check "integer 0 id valid + parentable" "$([[ $RC -eq 0 && "$BEJSON_LISTS_STATS" == *'"max_depth":1'* ]] && echo ok)"

cat > "$TMP/nofields.bejson" <<'JSON'
{"Format":"BEJSON","Format_Version":"104a","Format_Creator":"Elton Boehnen","Records_Type":["X"],
 "Fields":[{"name":"id","type":"string"},{"name":"label","type":"string"}],"Values":[["a","x"]]}
JSON
run "$TMP/nofields.bejson"; check "missing id/parent_id" "$(has "$E_LISTS_MISSING_FIELDS")"
cat > "$TMP/db.bejson" <<'JSON'
{"Format":"BEJSON","Format_Version":"104db","Format_Creator":"Elton Boehnen","Records_Type":["A","B"],
 "Fields":[{"name":"Record_Type_Parent","type":"string"},{"name":"id","type":"string"}],"Values":[]}
JSON
run "$TMP/db.bejson"; check "104db rejected" "$([[ $RC -ne 0 ]] && echo ok)"
cat > "$TMP/nocreator.bejson" <<'JSON'
{"Format":"BEJSON","Format_Version":"104a","Records_Type":["X"],"Fields":[],"Values":[]}
JSON
run "$TMP/nocreator.bejson"; check "structural failure -> STRUCTURE_INVALID" "$(has "$E_LISTS_STRUCTURE_INVALID")"
run "$TMP/does-not-exist.bejson"; check "missing file fails" "$([[ $RC -ne 0 ]] && echo ok)"

mkf f_ok '[[["x","y"]],[null]]';  runf "$TMP/f_ok.bejson" tags string;   check "field: ok + null cells" "$([[ $RC -eq 0 ]] && echo ok)"
mkf f_int '[[[1,2]]]';            runf "$TMP/f_int.bejson" tags integer;  check "field: integers ok" "$([[ $RC -eq 0 ]] && echo ok)"
mkf f_flt '[[[1.5]]]';            runf "$TMP/f_flt.bejson" tags integer;  check "field: 1.5 is not integer" "$(has "$E_LISTS_ITEM_TYPE_MISMATCH")"
mkf f_bool '[[[true]]]';          runf "$TMP/f_bool.bejson" tags number;  check "field: bool is not number" "$(has "$E_LISTS_ITEM_TYPE_MISMATCH")"
mkf f_mix '[[["x",1]]]';          runf "$TMP/f_mix.bejson" tags string;   check "field: wrong item type" "$(has "$E_LISTS_ITEM_TYPE_MISMATCH")"
mkf f_na '[["x"]]';               runf "$TMP/f_na.bejson" tags string;    check "field: not an array" "$(has "$E_LISTS_FIELD_NOT_ARRAY")"
runf "$TMP/f_ok.bejson" nope string;                                      check "field: not found" "$(has "$E_LISTS_FIELD_NOT_FOUND")"
runf "$TMP/f_ok.bejson" tags banana;                                      check "field: bad allowed type" "$([[ $RC -ne 0 ]] && echo ok)"

echo; echo "$PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
