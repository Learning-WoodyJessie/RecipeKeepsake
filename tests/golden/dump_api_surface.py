# Regenerates tests/golden/api_surface_*.json. Usage: python tests/golden/dump_api_surface.py <repo path> > file.json
# The snapshot pins the request/response contract of every endpoint that existed when background capture was added.
import json, sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, sys.argv[1])
import os; os.chdir(sys.argv[1])
from scripts.serve import app
spec = app.openapi()
out = {}
for path, ops in spec["paths"].items():
    for method, op in ops.items():
        body = {}
        content = op.get("requestBody", {}).get("content", {})
        for ctype, c in content.items():
            ref = c.get("schema", {}).get("$ref")
            if ref:
                schema = spec["components"]["schemas"][ref.split("/")[-1]]
                body[ctype] = sorted(schema.get("properties", {}))
                body[ctype + ":required"] = sorted(schema.get("required", []))
        params = sorted((p["in"], p["name"], bool(p.get("required"))) for p in op.get("parameters", []))
        out[f"{method.upper()} {path}"] = {"params": params, "body": body, "responses": sorted(op.get("responses", {}))}
print(json.dumps(out, indent=1, sort_keys=True))
