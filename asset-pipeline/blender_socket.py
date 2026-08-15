#!/usr/bin/env python3
"""Send a python snippet to the blender-mcp addon socket (localhost:9876).

Usage:  bl.py "code"        — execute inline code
        bl.py -f file.py    — execute `exec(open(file).read())` remotely
        bl.py -f file.py "call()"  — exec file then run the trailing code
Prints the JSON result. Generous timeout for renders.
"""
import socket, json, sys

def send(code, timeout=420):
    s = socket.create_connection(("localhost", 9876), timeout=10)
    s.settimeout(timeout)
    payload = {"type": "execute_code", "params": {"code": code}}
    s.sendall(json.dumps(payload).encode())
    data = b""
    while True:
        try:
            chunk = s.recv(1 << 16)
        except socket.timeout:
            break
        if not chunk:
            break
        data += chunk
        try:
            json.loads(data.decode())
            break
        except Exception:
            continue
    s.close()
    return data.decode()

if __name__ == "__main__":
    args = sys.argv[1:]
    code = ""
    if args and args[0] == "-f":
        path = args[1]
        code = "exec(compile(open(%r).read(), %r, 'exec'), globals())\n" % (path, path)
        args = args[2:]
    if args:
        code += args[0]
    out = send(code)
    try:
        j = json.loads(out)
        r = j.get("result", j)
        if isinstance(r, dict) and "result" in r:
            r = r["result"]
        print(json.dumps(j)[:3000])
    except Exception:
        print(out[:3000])
