"""Run the reviewed UI helpers with Stable's isolated Python interpreter."""
import pathlib
import runpy
import sys

scripts = pathlib.Path(__file__).resolve().parent
targets = {"search": "search.py", "design-system": "design_system.py"}
if len(sys.argv) < 2 or sys.argv[1] not in targets:
    raise SystemExit("Usage: stable_ui.py search|design-system <query> [options]")
target = scripts / targets[sys.argv[1]]
sys.path.insert(0, str(scripts))
sys.argv = [str(target), *sys.argv[2:]]
runpy.run_path(str(target), run_name="__main__")
