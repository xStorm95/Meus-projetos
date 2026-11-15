#!/usr/bin/env bash
# ============================================================
#  qtstub.sh — reconstrói /tmp/qtstub (ambiente de validação offscreen)
#
#  O sandbox de validação não tem libGL/EGL/xkbcommon/dbus reais.
#  Este script gera stubs ELF vazios (com os símbolos que as libs do
#  PySide6 referenciam) para o import do Qt funcionar em modo offscreen.
#
#  Uso:  bash tools/qtstub.sh   (requer .venv com PySide6 + gcc)
#  Depois: LD_LIBRARY_PATH=/tmp/qtstub QT_QPA_PLATFORM=offscreen python ...
# ============================================================
set -euo pipefail
QTSTUB=/tmp/qtstub
VENV=${VENV:-$(cd "$(dirname "$0")/../.." && pwd)/.venv/bin/python}
PY=$("$VENV" --version >/dev/null 2>&1 && echo "$VENV" || echo python3)

mkdir -p "$QTSTUB"
cd "$QTSTUB"

# stubs sem símbolos (basta existirem para o loader)
for lib in libXdamage libXfixes libXrender libXrandr libxcb-cursor \
            libxcb-glx libxcb-icccm libxcb-image libxcb-keysyms libxcb-randr \
            libxcb-render libxcb-render-util libxcb-shape libxcb-shm libxcb-sync \
            libxcb-util libxcb-xfixes libxcb-xkb libOpenGL libX11-xcb; do
  gcc -shared -fPIC -o ${lib}.so.0 -Wl,-soname,${lib}.so.0 -xc /dev/null 2>/dev/null || true
done

# stubs com símbolos coletados das libs+plugins do PySide6
"$PY" <<'EOF'
import subprocess, re, os, sys
BASE = os.path.abspath(os.path.join(os.path.dirname(sys.executable), "..",
                                    "lib", "python3.11", "site-packages",
                                    "PySide6", "Qt"))
DIRS = [os.path.join(BASE, "lib"), os.path.join(BASE, "plugins")]

def build(soname, pattern):
    syms = set()
    for d in DIRS:
        for root, _, files in os.walk(d):
            for f in files:
                if not (f.endswith(".so.6") or f.endswith(".so") or f.endswith(".so.1")):
                    continue
                out = subprocess.run(["nm", "-D", "--undefined-only", os.path.join(root, f)],
                                     capture_output=True, text=True).stdout
                for line in out.splitlines():
                    m = re.match(r"\s+U\s+([A-Za-z0-9_]+)(?:@([A-Za-z0-9_.]+))?", line)
                    if not m:
                        continue
                    sym, ver = m.group(1), m.group(2) or ""
                    if ver.startswith("GLIBC"):
                        continue
                    if re.match(pattern, sym):
                        syms.add((sym, ver))
    with open("stub.c", "w") as c:
        for s, v in sorted(syms):
            c.write(f"void {s}(void) {{}}\n")
    by_ver = {}
    for s, v in syms:
        by_ver.setdefault(v, []).append(s)
    with open("stub.map", "w") as m:
        if "" in by_ver and len(by_ver) == 1:
            m.write("{ global:\n" + "\n".join(f"  {s};" for s in by_ver[""]) + "\n};\n")
        else:
            for v, ss in by_ver.items():
                if v == "":
                    continue
                m.write(f"{v} {{\n  global:\n" + "\n".join(f"    {s};" for s in ss) + "\n};\n")
            if "" in by_ver:
                m.write("{ global:\n" + "\n".join(f"  {s};" for s in by_ver[""]) + "\n};\n")
    r = subprocess.run(["gcc", "-shared", "-fPIC", "-o", soname, "stub.c",
                        "-Wl,--version-script=stub.map", f"-Wl,-soname,{soname}"],
                       capture_output=True, text=True)
    print(soname, "->", len(syms), "simbolos", "OK" if r.returncode == 0 else r.stderr[:200])

build("libGL.so.1", r"^gl[A-Z_]")
build("libGLESv2.so.2", r"^gl[A-Z]")
build("libEGL.so.1", r"^egl[A-Z]")
build("libxkbcommon.so.0", r"^xkb_")
build("libxkbcommon-x11.so.0", r"^xkb_x11")
build("libdbus-1.so.3", r"^dbus_")
EOF

echo "qtstub pronto em $QTSTUB"
