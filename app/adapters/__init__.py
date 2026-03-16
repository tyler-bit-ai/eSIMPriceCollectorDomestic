"""Site adapter package."""

import sys
from importlib import import_module, reload


def ensure_adapter_module(site: str) -> None:
    module_name = f"app.adapters.{site}"
    try:
        if module_name in sys.modules:
            reload(sys.modules[module_name])
        else:
            import_module(module_name)
    except ModuleNotFoundError:
        return
