"""
규칙 검사 (AI 없음, docs/GENERATION_STANDARD.md 5장) — 코드를 실행하지 않고 문법만 읽어요.

  code_problems(code, language)   규칙 검사 1: 문법 오류 · 빈 코드 · 너무 긴 코드 · (Python) 정의하지 않은 이름
  flow_points(code, language)     코드의 함수·반복문 위치 → 규칙 검사 2 (검토 기록이 빠짐없이 다뤘는지)
모듈·랜덤·시각·입력 같은 언어 기능은 금지하지 않아요.
"""
import ast
import builtins
import re

import tree_sitter_javascript
from tree_sitter import Language, Parser

MAX_LINES = 300   # 이보다 길면 손으로 따라가기 어려워서 다시 만든다 (난이도 기준이 아니라 안전 한도)
_PY_BUILTINS = set(dir(builtins))
_JS_PARSER = Parser(Language(tree_sitter_javascript.language()))
_OPENER = {"}": "{", ")": "(", "]": "["}
_JS_FUNCS = ("function_declaration", "generator_function_declaration", "method_definition")
_JS_LOOPS = ("for_statement", "for_in_statement", "while_statement", "do_statement")


def code_problems(code, language):
    """규칙 검사 1 → 문제 목록 (비어 있으면 통과)"""
    lines = code.split("\n")
    if not code.strip():
        return ["코드가 비어 있어요"]
    if len(lines) > MAX_LINES:
        return [f"코드가 {len(lines)}줄이라 너무 길어요 ({MAX_LINES}줄 이하)"]
    return py_problems(code) if language == "python" else js_problems(code)


# ───────────────────────── Python (ast) ─────────────────────────


def py_problems(code):
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return [f"Python 문법 오류 ({e.lineno}번째 줄: {e.msg})"]
    return undefined_names(tree)


def undefined_names(tree):
    """어디에도 정의하지 않은 이름 (오타). import * 를 쓰면 알 수 없어서 보지 않는다"""
    if any(isinstance(n, ast.ImportFrom) and any(a.name == "*" for a in n.names) for n in ast.walk(tree)):
        return []
    bound, used = set(), []
    aug_targets = {id(n.target) for n in ast.walk(tree) if isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name)}   # total += 1 의 total 은 먼저 읽는다
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            bound.update((a.asname or a.name).split(".")[0] for a in node.names)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bound.add(node.name)
        elif isinstance(node, ast.arg):
            bound.add(node.arg)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bound.add(node.name)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            bound.update(node.names)
        elif isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name:
            bound.add(node.name)
        elif isinstance(node, ast.MatchMapping) and node.rest:
            bound.add(node.rest)
        elif isinstance(node, ast.Name):
            if isinstance(node.ctx, ast.Load) or id(node) in aug_targets:
                used.append((node.id, node.lineno))
            else:
                bound.add(node.id)
    unknown = {}
    for name, line in used:
        if name not in bound and name not in _PY_BUILTINS:
            unknown.setdefault(name, line)
    return [f"{line}번째 줄: {name} 은(는) 어디에도 정의하지 않은 이름이에요 (오타인지 확인)"
            for name, line in sorted(unknown.items(), key=lambda x: x[1])[:3]]


# ───────────────────────── JavaScript (tree-sitter: Lambda 에 Node.js 가 없어서 문법 나무로 읽는다) ─────────────────────────


def _nodes(node):
    yield node
    for child in node.children:
        yield from _nodes(child)


def js_problems(code):
    root = _JS_PARSER.parse(code.encode("utf-8")).root_node
    if root.has_error:
        return [js_syntax_error(root)]
    if re.search(r"^\s*(def|elif)\s|^\s*print\s*\(", code, re.M):
        return ["Python 문법(def·elif·print)이 섞였어요. JavaScript 로만 써 주세요"]
    return []


def js_syntax_error(root):
    """첫 문법 오류 하나를 고칠 수 있는 말로 (tree-sitter 의 ERROR · 빠진 기호 MISSING)"""
    for node in _nodes(root):
        line = node.start_point[0] + 1
        if node.is_missing:
            opener = _OPENER.get(node.type)
            if opener and node.parent:
                return f"{node.parent.start_point[0] + 1}번째 줄에서 연 '{opener}' 가 닫히지 않았어요"
            return f"{line}번째 줄 근처에 '{node.type}' 가 빠졌어요"
        if node.type == "ERROR":
            text = node.text.decode("utf-8", "replace").strip()
            if text[:1] in ("'", '"', "`"):
                return f"{line}번째 줄의 따옴표({text[:1]})가 닫히지 않았어요"
            return f"{line}번째 줄에 JavaScript 문법 오류가 있어요: {text.split(chr(10))[0][:40]}"
    return "JavaScript 문법 오류가 있어요"


# ───────────────────────── 함수·반복문 위치 (규칙 검사 2) ─────────────────────────


def flow_points(code, language):
    """[{kind: function|loop, name, start, end}] (줄 번호는 1부터). 문법 오류면 빈 목록"""
    if language == "python":
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return []
        out = []
        for n in ast.walk(tree):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                out.append({"kind": "function", "name": n.name, "start": n.lineno, "end": n.end_lineno})
            elif isinstance(n, (ast.For, ast.While, ast.AsyncFor)):
                out.append({"kind": "loop", "name": "", "start": n.lineno, "end": n.end_lineno})
        return sorted(out, key=lambda p: p["start"])
    root = _JS_PARSER.parse(code.encode("utf-8")).root_node
    if root.has_error:
        return []
    out = []
    for n in _nodes(root):
        name = None
        if n.type in _JS_FUNCS and n.child_by_field_name("name"):
            name = n.child_by_field_name("name").text.decode()
        elif n.type == "variable_declarator" and n.child_by_field_name("value") is not None \
                and n.child_by_field_name("value").type in ("arrow_function", "function_expression", "function"):
            name = n.child_by_field_name("name").text.decode()
        if name:
            out.append({"kind": "function", "name": name, "start": n.start_point[0] + 1, "end": n.end_point[0] + 1})
        elif n.type in _JS_LOOPS:
            out.append({"kind": "loop", "name": "", "start": n.start_point[0] + 1, "end": n.end_point[0] + 1})
    return sorted(out, key=lambda p: p["start"])


def uncovered(points, units):
    """검토 기록(흐름 단위)이 다루지 않은 함수·반복문: 반복문은 그 첫 줄이, 함수는 범위 일부가 어느 단위 안에 있어야 한다"""
    def covered(p):
        if p["kind"] == "loop":
            return any(u["start"] <= p["start"] <= u["end"] for u in units)
        return any(u["start"] <= p["end"] and p["start"] <= u["end"] for u in units)
    return [p for p in points if not covered(p)]
