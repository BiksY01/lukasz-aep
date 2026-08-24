/* The AUDIO 1 widget.
 *
 * Same trick as the Veil one next door: a shadow root so this page's CSS and the
 * widget's cannot reach each other. Different destination though. Veil resolves
 * into graphite and violet; this one resolves into AUDIO 1's near-black and red,
 * because that is what the site it points at actually looks like.
 *
 * No network calls, no font this page has not already loaded, no cookie. A link
 * wearing the right clothes.
 *
 * Mount with <audio1-widget></audio1-widget>.
 */
(() => {
  "use strict";

  const SITE_URL = "https://audio1agency.com/?ref=aero";

  /* All three are true and checkable on the live site, which is the only reason
     they are worth printing. Do not add a number here that cannot be verified. */
  const FACTS = [
    { k: "languages", v: "10" },
    { k: "trackers", v: "0" },
    { k: "in media since", v: "1999" },
  ];

  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const text = (n, s) => { n.textContent = s; return n; };

  class Audio1Widget extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });

      // Stylesheet link, not an inline <style>: the site's CSP is style-src
      // 'self' with no unsafe-inline and this keeps it that way.
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "/css/audio1-widget.css";
      root.append(styles, this.#build());
    }

    #build() {
      const shell = el("div", "shell");
      const core = el("div", "core");

      core.append(
        text(el("p", "eyebrow"), "client work"),
        text(el("h3", "title"), "AUDIO 1"),
        this.#blurb(),
        this.#facts(),
        this.#actions(),
        text(
          el("p", "footnote"),
          "no analytics, no cookies, no third-party requests. dmarc, caa and " +
            "dnssec are all on. the whole thing is about 300kb."
        )
      );

      shell.append(core);
      return shell;
    }

    /* Keep this about the studio and the build, never about who runs it or who
       is related to whom. It is a work sample, not a bio. */
    #blurb() {
      const p = el("p", "line");
      p.append(
        "a media studio in gornja radgona — radio production, station voice, " +
          "jingles and original music, going since ",
        text(el("strong"), "1999"),
        ". the site runs ten languages, a 3d laptop that opens as you scroll, " +
          "and nothing tracking anyone."
      );
      return p;
    }

    #facts() {
      const ul = el("ul", "facts");
      for (const f of FACTS) {
        const li = el("li");
        li.append(text(el("span", "k"), f.k), text(el("span", "v"), f.v));
        ul.append(li);
      }
      return ul;
    }

    #actions() {
      const wrap = el("div", "actions");
      const a = el("a", "cta");
      a.href = SITE_URL;
      a.rel = "noopener";
      a.target = "_blank";
      text(a, "audio1agency.com");
      wrap.append(a);
      return wrap;
    }
  }

  customElements.define("audio1-widget", Audio1Widget);
})();
