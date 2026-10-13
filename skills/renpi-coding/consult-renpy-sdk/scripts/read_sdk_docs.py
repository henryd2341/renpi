"""Read and search local Ren'Py Sphinx HTML, without executing or modifying it."""

import argparse
import os
from pathlib import Path
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit


class Node:
    def __init__(self, tag="", attrs=(), parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parent = parent
        self.children = []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()


class Document(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.current = self.root
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent is not None:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)

    def body(self):
        for key, value in (("itemprop", "articleBody"), ("role", "main")):
            for node in self.root.walk():
                if node.attrs.get(key) == value:
                    return node
        raise ValueError("No Sphinx main/articleBody content found")


BLOCKS = {"div", "section", "p", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
          "ul", "ol", "li", "dl", "dt", "dd", "table", "tr", "blockquote"}


def render(node, *, own_section=False):
    """Keep preformatted text verbatim; collapse only normal HTML whitespace."""
    parts = []

    def visit(item, pre=False):
        if isinstance(item, str):
            parts.append(item if pre else re.sub(r"\s+", " ", item))
            return
        if item.tag in {"script", "style", "nav", "header", "footer"} or (
            "headerlink" in item.attrs.get("class", "").split()
        ):
            return
        if own_section and item is not node and (
            item.tag == "section" or
            (item.tag == "dl" and any(n.tag == "dt" and n.attrs.get("id")
                                     for n in item.walk()))
        ):
            return
        if item.tag in BLOCKS or item.tag == "br":
            parts.append("\n")
        for child in item.children:
            visit(child, pre or item.tag == "pre")
        if item.tag == "a" and "internal" in item.attrs.get("class", "").split():
            href = item.attrs.get("href", "")
            if href:
                parts.append(f" [{href}]")
        if item.tag in {"td", "th"}:
            parts.append(" | ")
        if item.tag in BLOCKS:
            parts.append("\n")

    visit(node)
    # Preserve leading spaces inside pre blocks: never strip each output line.
    return "".join(parts).strip("\r\n")


def doc_root(sdk):
    if not sdk:
        raise ValueError("Set --sdk PATH or RENPY_HOME")
    if urlsplit(sdk).scheme and not Path(sdk).is_absolute():
        raise ValueError("SDK must be a local directory")
    base = Path(sdk).expanduser().resolve()
    roots = [p.resolve() for name in ("doc", "docs")
             if (p := base / name).is_dir() and any(p.glob("*.html"))]
    if not roots:
        raise ValueError(f"No HTML documentation directory in {base} (doc/ or docs/)")
    print(f"Documentation root: {roots[0]}" +
          (f" (also found {roots[1]}; selected doc/)" if len(roots) > 1 else ""))
    return roots[0]


def local_page(root, target):
    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc or parsed.query:
        raise ValueError("Expected local PAGE.html[#ANCHOR], not a URL/query")
    relative = Path(unquote(parsed.path))
    if relative.is_absolute() or relative.drive:
        raise ValueError("Page must be relative to documentation root")
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or path.suffix.lower() != ".html":
        raise ValueError("Page must be an HTML file inside documentation root")
    return path, unquote(parsed.fragment)


def load(path):
    return Document(path.read_text(encoding="utf-8")).body()


def selected_nodes(body, anchor):
    if not anchor:
        return [body]
    node = next((n for n in body.walk() if n.attrs.get("id") == anchor), None)
    if node is None:
        raise ValueError(f"Anchor not found in main content: #{anchor}")
    return node_content(node, body)


def node_content(node, body):
    if node.tag == "dt":
        siblings = node.parent.children
        result = [node]
        for sibling in siblings[siblings.index(node) + 1:]:
            if isinstance(sibling, Node):
                if sibling.tag == "dt":
                    continue  # Multiple signatures may share the following definition.
                if sibling.tag == "dd":
                    result.append(sibling)
                break
        return result
    if node.tag in {"span", "h1", "h2", "h3", "h4", "h5", "h6"}:
        parent = node.parent
        while parent is not None and parent is not body:
            if parent.tag == "section":
                return [parent]
            parent = parent.parent
    return [node]


def read_page(root, target, max_chars):
    path, anchor = local_page(root, target)
    content = "\n".join(render(n) for n in selected_nodes(load(path), anchor))
    print(f"File: {path}\nAnchor: {'#' + anchor if anchor else '(whole main body)'}")
    print(content[:max_chars])
    if len(content) > max_chars:
        print(f"\n[TRUNCATED: displayed {max_chars} of {len(content)} characters]")


def search(root, query, limit):
    query = " ".join(query.split()).casefold()
    if not query:
        raise ValueError("Search query must not be empty")
    count = 0
    for path in sorted(root.rglob("*.html")):
        if not path.resolve().is_relative_to(root):
            continue
        try:
            body = load(path)
        except ValueError as error:
            print(f"Skipped {path}: {error}", file=sys.stderr)
            continue
        candidates = [body] + [n for n in body.walk()
                               if n.tag in {"section", "dt"} and n.attrs.get("id")]
        for node in candidates:
            anchor = node.attrs.get("id", "")
            nodes = node_content(node, body) if node.tag == "dt" else [node]
            content = " ".join(" ".join(render(n, own_section=True) for n in nodes).split())
            index = content.casefold().find(query)
            if index < 0:
                continue
            title_node = next((n for n in node.walk() if n.tag in {"h1", "h2", "h3", "h4", "h5", "h6"}), node)
            title = " ".join(render(title_node, own_section=True).split())[:100]
            reference = path.relative_to(root).as_posix() + (f"#{anchor}" if anchor else "")
            print(f"{reference} — {title}\n  {content[max(0, index - 70):index + len(query) + 160]}")
            count += 1
            if count == limit:
                print(f"[LIMIT: {limit} matches; additional matches may exist]")
                return
    if not count:
        print("No matches.")


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("Must be positive")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", default=os.environ.get("RENPY_HOME"))
    commands = parser.add_subparsers(dest="command", required=True)
    find = commands.add_parser("search")
    find.add_argument("query")
    find.add_argument("--limit", type=positive, default=8)
    read = commands.add_parser("read")
    read.add_argument("page")
    read.add_argument("--max-chars", type=positive, default=12000)
    args = parser.parse_args()
    try:
        root = doc_root(args.sdk)
        if args.command == "read":
            read_page(root, args.page, args.max_chars)
        else:
            search(root, args.query, args.limit)
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
