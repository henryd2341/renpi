import contextlib
import io
from pathlib import Path
import tempfile
import unittest

import read_sdk_docs as docs


HTML = '''<html><nav>NAVIGATION</nav><div role="main">
<div itemprop="articleBody"><section id="audio"><h1>Audio</h1>
<section id="play-statement"><h2>Play Statement<a class="headerlink">LINK</a></h2>
<p>Play music &amp; sounds. <a class="reference internal" href="atl.html#animation">Animation</a></p>
<pre><span>if a &lt; b &amp; c &gt; d:</span>
    play music "theme.ogg"
        # indentation</pre><script>BAD_SCRIPT</script><style>BAD_STYLE</style></section>
<section id="functions"><h2>Functions</h2><dl>
<dt id="renpy.play">renpy.play(filename)</dt><dd><p>Plays a sound effect.</p></dd>
<dt id="renpy.stop">renpy.stop()</dt><dd>Stops music.</dd></dl></section>
</section></div><footer>FOOTER</footer></div></html>'''


class StructureTests(unittest.TestCase):
    def test_missing_main_body_fails_explicitly(self):
        with self.assertRaisesRegex(ValueError, "No Sphinx main/articleBody"):
            docs.Document("<html><nav>Navigation only</nav></html>").body()


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.sdk = Path(self.temp.name)
        self.root = self.sdk / "doc"
        self.root.mkdir()
        (self.root / "audio.html").write_text(HTML, encoding="utf-8")
        self.body = docs.load(self.root / "audio.html")

    def capture(self, function, *args):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            function(*args)
        return output.getvalue()

    def test_main_filter_and_entities_and_indentation(self):
        text = docs.render(self.body)
        for excluded in ("NAVIGATION", "FOOTER", "BAD_SCRIPT", "BAD_STYLE", "LINK"):
            self.assertNotIn(excluded, text)
        self.assertIn('if a < b & c > d:\n    play music "theme.ogg"\n        # indentation', text)
        self.assertIn("[atl.html#animation]", text)

    def test_section_isolation(self):
        text = docs.render(docs.selected_nodes(self.body, "play-statement")[0])
        self.assertIn("Play Statement", text)
        self.assertNotIn("Functions", text)

    def test_function_includes_definition_not_next_function(self):
        text = "\n".join(map(docs.render, docs.selected_nodes(self.body, "renpy.play")))
        self.assertIn("renpy.play(filename)", text)
        self.assertIn("Plays a sound effect.", text)
        self.assertNotIn("renpy.stop", text)

    def test_missing_anchor_fails(self):
        with self.assertRaisesRegex(ValueError, "Anchor not found"):
            docs.selected_nodes(self.body, "missing")

    def test_unsafe_paths_fail(self):
        for target in ("../secret.html", "%2e%2e/secret.html", "https://example.com/a.html",
                       "//example.com/a.html", "file:///tmp/a.html", "audio.html?q=1",
                       str(self.sdk / "outside.html"), "audio.txt"):
            with self.subTest(target=target), self.assertRaises(ValueError):
                docs.local_page(self.root, target)

    def test_search_matches_anchor_and_limits_output(self):
        output = self.capture(docs.search, self.root, "sound effect", 1)
        self.assertIn("audio.html#renpy.play", output)
        self.assertIn("Plays a sound effect.", output)
        self.assertIn("LIMIT: 1", output)
        self.assertNotIn("NAVIGATION", output)

    def test_search_skips_non_article_html(self):
        (self.root / "a-redirect.html").write_text("<html>Redirect only</html>", encoding="utf-8")
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors):
            output = self.capture(docs.search, self.root, "missing-needle", 8)
        self.assertIn("No matches.", output)
        self.assertIn("Skipped", errors.getvalue())
        self.assertIn("a-redirect.html", errors.getvalue())

    def test_read_reports_provenance_and_truncation(self):
        output = self.capture(docs.read_page, self.root, "audio.html#play-statement", 20)
        self.assertIn(str(self.root / "audio.html"), output)
        self.assertIn("Anchor: #play-statement", output)
        self.assertIn("TRUNCATED", output)

    def test_docs_fallback_and_both_directory_selection(self):
        self.root.rename(self.sdk / "docs")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(docs.doc_root(str(self.sdk)), self.sdk / "docs")
        self.root.mkdir()
        (self.root / "index.html").write_text(HTML, encoding="utf-8")
        output = self.capture(docs.doc_root, str(self.sdk))
        self.assertIn("also found", output)
        self.assertIn("selected doc/", output)


if __name__ == "__main__":
    unittest.main()
