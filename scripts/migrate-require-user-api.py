#!/usr/bin/env python3
"""Migrate dealer API routes from cookie-only auth to requireUserApi (Bearer + cookie)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "app/api/saas/me/route.ts",
    "app/api/saas/start-trial/route.ts",
    "app/api/saas/sync-payment/route.ts",
    "app/api/saas/checkout/route.ts",
    "app/api/customers/route.ts",
    "app/api/customers/[id]/route.ts",
    "app/api/customers/[id]/crm-tags/route.ts",
    "app/api/customers/[id]/chat-history/route.ts",
    "app/api/customers/[id]/profile-picture/route.ts",
    "app/api/customers/[id]/analyze-tags/route.ts",
    "app/api/customers/[id]/follow-up-activities/route.ts",
    "app/api/customers/[id]/labels/route.ts",
    "app/api/customers/bulk/route.ts",
    "app/api/customers/stats/route.ts",
    "app/api/customers/variables/route.ts",
    "app/api/whatsapp/provider/route.ts",
    "app/api/me/follow-up-bookmark/route.ts",
    "app/api/waha/sessions/route.ts",
]

IMPORT_COOKIE = "import { createClient } from '@/app/lib/supabase/server'"
IMPORT_USER = "import { requireUserApi } from '@/app/lib/auth/require-user'"

AUTH_BLOCK = re.compile(
    r"(?P<indent>[ \t]*)const supabase = await createClient\(\)\s*\n"
    r"(?:(?P=indent)//[^\n]*\n)*"
    r"(?P=indent)const \{\s*"
    r"(?:data: \{ user \}, error: authError"
    r"|data: \{ user \},\s*\n(?P=indent)  error: authError,"
    r"|\n(?P=indent)  data: \{ user \},\n(?P=indent)  error: authError,\n(?P=indent))"
    r"\s*\} = await supabase\.auth\.getUser\(\)\s*\n"
    r"(?P=indent)if \(authError \|\| !user\) \{\s*\n"
    r"(?P=indent)  return NextResponse\.json\(\s*"
    r"(?:\{ error: 'Unauthorized' \}, \{ status: 401(?:, headers: [^\]]+\])? \}"
    r"|\n(?P=indent)    \{ error: 'Unauthorized' \},\n(?P=indent)    \{ status: 401(?:, headers: [^\]]+\])? \}\n(?P=indent)  )"
    r"\s*\)\s*\n"
    r"(?P=indent)\}",
    re.MULTILINE,
)


def ensure_import(text: str) -> str:
    if IMPORT_USER in text:
        return text
    if IMPORT_COOKIE in text:
        return text.replace(IMPORT_COOKIE, f"{IMPORT_COOKIE}\n{IMPORT_USER}", 1)
    lines = text.splitlines(True)
    insert_at = 0
    for i, line in enumerate(lines):
        if line.startswith("import "):
            insert_at = i + 1
    lines.insert(insert_at, IMPORT_USER + "\n")
    return "".join(lines)


def remove_unused_create_client_import(text: str) -> str:
    if "await createClient()" in text:
        return text
    return text.replace(IMPORT_COOKIE + "\n", "")


def transform(text: str) -> tuple[str, int]:
    count = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal count
        count += 1
        ind = m.group("indent")
        return (
            f"{ind}const auth = await requireUserApi(request)\n"
            f"{ind}if (!auth.ok) return auth.response\n"
            f"{ind}const {{ user, supabase }} = auth"
        )

    new = AUTH_BLOCK.sub(repl, text)
    return new, count


def ensure_request_param(text: str) -> str:
    if "requireUserApi(request)" not in text:
        return text
    text = re.sub(
        r"export async function (GET|POST|PUT|PATCH|DELETE)\(\)",
        r"export async function \1(request: Request)",
        text,
    )
    text = re.sub(
        r"export async function (GET|POST|PUT|PATCH|DELETE)\(_request: Request",
        r"export async function \1(request: Request",
        text,
    )
    return text


def main() -> None:
    changed = 0
    for rel in FILES:
        path = ROOT / rel
        if not path.exists():
            print(f"MISSING {rel}")
            continue
        original = path.read_text()
        new, n = transform(original)
        if n == 0:
            print(f"NO MATCH {rel}")
            continue
        new = ensure_import(new)
        new = remove_unused_create_client_import(new)
        new = ensure_request_param(new)
        path.write_text(new)
        changed += 1
        print(f"OK {rel} ({n})")
    print(f"\nUpdated {changed} files")


if __name__ == "__main__":
    main()
