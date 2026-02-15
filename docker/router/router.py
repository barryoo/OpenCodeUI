import base64
import json
import os
import secrets
import re
import string
import subprocess
import time
from flask import Flask, jsonify, request, Response


app = Flask(__name__)


def env_int(name, default):
    value = os.getenv(name, str(default))
    try:
        return int(value)
    except ValueError:
        return default


def parse_port_range(value):
    match = re.match(r"^(\d+)-(\d+)$", value or "")
    if not match:
        return (3000, 9999)
    start = int(match.group(1))
    end = int(match.group(2))
    if start > end:
        start, end = end, start
    return (start, end)


def parse_exclude_ports(value):
    ports = set()
    for item in (value or "").split(","):
        item = item.strip()
        if not item:
            continue
        try:
            ports.add(int(item))
        except ValueError:
            continue
    return ports


TARGET_CONTAINER = os.getenv("TARGET_CONTAINER", "opencode-backend")
GATEWAY_CONTAINER = os.getenv("GATEWAY_CONTAINER", "opencode-gateway")
ROUTER_MAP_FILE = os.getenv("ROUTER_MAP_FILE", "/token_map/token_map.conf")
ROUTER_STATE_FILE = os.getenv("ROUTER_STATE_FILE", "/data/routes.json")
SCAN_INTERVAL = env_int("ROUTER_SCAN_INTERVAL", 5)
TOKEN_LENGTH = env_int("ROUTER_TOKEN_LENGTH", 12)
PORT_RANGE = parse_port_range(os.getenv("ROUTER_PORT_RANGE", "3000-9999"))
EXCLUDE_PORTS = parse_exclude_ports(os.getenv("ROUTER_EXCLUDE_PORTS", "4096"))
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
ROUTER_USERNAME = os.getenv("ROUTER_USERNAME", "")
ROUTER_PASSWORD = os.getenv("ROUTER_PASSWORD", "")


def load_state():
    if not os.path.exists(ROUTER_STATE_FILE):
        return {}
    try:
        with open(ROUTER_STATE_FILE, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state):
    os.makedirs(os.path.dirname(ROUTER_STATE_FILE), exist_ok=True)
    with open(ROUTER_STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=True, indent=2, sort_keys=True)


def generate_token(length):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def run_cmd(args):
    result = subprocess.run(
        args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    if result.returncode != 0:
        return ""
    return result.stdout


def parse_proc_net_tcp(output):
    ports = set()
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("sl"):
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[1]
        state = parts[3]
        if state != "0A":
            continue
        if ":" not in local:
            continue
        port_hex = local.rsplit(":", 1)[-1]
        try:
            port = int(port_hex, 16)
        except ValueError:
            continue
        ports.add(port)
    return ports


def list_listening_ports():
    output = run_cmd(
        [
            "docker",
            "exec",
            TARGET_CONTAINER,
            "sh",
            "-c",
            "cat /proc/net/tcp /proc/net/tcp6",
        ]
    )
    ports = parse_proc_net_tcp(output)
    filtered = []
    start, end = PORT_RANGE
    for port in ports:
        if port in EXCLUDE_PORTS:
            continue
        if port < start or port > end:
            continue
        filtered.append(port)
    return sorted(filtered)


def write_map(state):
    lines = ["# token -> port mapping (auto generated)"]
    for token, info in sorted(state.items()):
        port = info.get("port")
        if not port:
            continue
        lines.append(f"{token} {port};")
    content = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(ROUTER_MAP_FILE), exist_ok=True)
    with open(ROUTER_MAP_FILE, "w", encoding="utf-8") as handle:
        handle.write(content)


def reload_gateway():
    run_cmd(["docker", "exec", GATEWAY_CONTAINER, "nginx", "-s", "reload"])


def sync_routes():
    state = load_state()
    ports = list_listening_ports()
    existing_ports = {info.get("port") for info in state.values()}

    changed = False
    for port in ports:
        if port in existing_ports:
            continue
        token = generate_token(TOKEN_LENGTH)
        while token in state:
            token = generate_token(TOKEN_LENGTH)
        state[token] = {
            "port": port,
            "created_at": int(time.time()),
        }
        changed = True

    active_ports = set(ports)
    stale_tokens = [
        token for token, info in state.items() if info.get("port") not in active_ports
    ]
    for token in stale_tokens:
        del state[token]
        changed = True

    if changed:
        write_map(state)
        save_state(state)
        reload_gateway()


def check_basic_auth(auth_header):
    if not ROUTER_PASSWORD:
        return True
    if not auth_header or not auth_header.lower().startswith("basic "):
        return False
    raw = auth_header.split(" ", 1)[1].strip()
    try:
        decoded = base64.b64decode(raw).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return False
    if ":" not in decoded:
        return False
    user, pwd = decoded.split(":", 1)
    return user == ROUTER_USERNAME and pwd == ROUTER_PASSWORD


@app.get("/routes")
def get_routes():
    if not check_basic_auth(request.headers.get("Authorization")):
        return Response(
            "Unauthorized", status=401, headers={"WWW-Authenticate": "Basic"}
        )

    state = load_state()
    routes = []
    for token, info in sorted(state.items()):
        port = info.get("port")
        if not port:
            continue
        public_url = ""
        if PUBLIC_BASE_URL:
            public_url = f"{PUBLIC_BASE_URL}/p/{token}/"
        routes.append(
            {
                "token": token,
                "port": port,
                "publicUrl": public_url,
                "createdAt": info.get("created_at"),
            }
        )
    return jsonify({"routes": routes})


def loop():
    while True:
        try:
            sync_routes()
        except Exception:
            pass
        time.sleep(SCAN_INTERVAL)


if __name__ == "__main__":
    from threading import Thread

    t = Thread(target=loop, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=7070)
