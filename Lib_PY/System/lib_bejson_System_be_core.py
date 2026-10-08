"""
Library:         lib_bejson_System_be_core.py
Family:          System
Module Purpose:  Implements runtime functionality and logic for lib_bejson_System_be_core.py.
Architecture:    BEJSON Core provides foundational format parsing, schema enforcement, path security, positional field map caching, and multi-format integration across runtime environments.
Version:         2.1.3
Release_Version: 300
Date:            2026-06-05
Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
Format_Creator:  Elton Boehnen
RELATIONAL_ID:   98133b14-604b-4206-aecb-17305b13984a
"""

import os
import sys
import time
from pathlib import Path

# --- Sibling Path Resolution ---
LIB_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.join(os.path.dirname(LIB_DIR), "Core")
if CORE_DIR not in sys.path: sys.path.insert(0, CORE_DIR)

from lib_bejson_Core_bejson_core import ResilientPIDLock

_DEFAULT_ADMIN_ROOT = str(Path(__file__).resolve().parent.parent.parent)

def get_admin_root():
    # Priority: 1. ENV, 2. Root State File, 3. Inferred Parent
    root_env = os.environ.get("ADMIN_ROOT")
    if root_env: return root_env
    
    # Resolve storage root from env to avoid hardcodes
    storage_root = os.environ.get("BEJSON_STORAGE_ROOT")
    if storage_root:
        root_file = os.path.join(storage_root, "Admin/data/state/ADMIN_ROOT.txt")
        if os.path.exists(root_file):
            with open(root_file, 'r') as f: return f.read().strip()
            
    return _DEFAULT_ADMIN_ROOT

def save_state(manager, key, value):
    """Saves a key-value pair to a manager state file with locking to prevent races."""
    root = get_admin_root()
    state_file = os.path.join(root, f"data/state/{manager}_manager_state.txt")
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    
    with ResilientPIDLock(state_file, timeout_seconds=10):
        try:
            lines = []
            if os.path.exists(state_file):
                with open(state_file, 'r') as f: lines = f.readlines()
            
            key_found = False
            new_lines = []
            for line in lines:
                if line.startswith(f"{key}="):
                    new_lines.append(f"{key}={value}\n")
                    key_found = True
                else: new_lines.append(line)
            
            if not key_found: new_lines.append(f"{key}={value}\n")
            
            tmp_file = state_file + ".tmp"
            with open(tmp_file, 'w') as f:
                f.writelines(new_lines)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_file, state_file)
        except Exception as e:
            print(f"Error saving state: {e}")

def load_state(manager, key):
    root = get_admin_root()
    state_file = os.path.join(root, f"data/state/{manager}_manager_state.txt")
    if os.path.exists(state_file):
        with open(state_file, 'r') as f:
            for line in f:
                if line.startswith(f"{key}="): return line.split("=", 1)[1].strip()
    return ""

def load_all_state(manager):
    root = get_admin_root()
    state_file = os.path.join(root, f"data/state/{manager}_manager_state.txt")
    state_dict = {}
    if os.path.exists(state_file):
        with open(state_file, 'r') as f:
            for line in f:
                if "=" in line:
                    k, v = line.split("=", 1)
                    state_dict[k.strip()] = v.strip()
    return state_dict