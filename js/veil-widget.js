/* The Veil widget.
 *
 * Lives in a shadow root so nothing it does can reach the rest of this page, and
 * nothing this page does can reach it. That containment is the whole reason it is
 * a custom element rather than a div: the two designs are deliberately opposed,
 * and letting either one bleed would ruin both.
 *
 * It makes no network requests, loads no font this site does not already have,
 * and sets no cookie. It is a link with a good outfit on.
 *
 * Mount it with <veil-widget></veil-widget>. It builds itself when it is nearly
 * on screen and not before.
 */
(() => {
  "use strict";

  const VEIL_URL = "https://veilapp.pages.dev/?ref=veil-widget";

  /* Must stay in step with support-matrix.json in the Veil repo, which is the
     only place platform support is actually declared. macOS and Android were
     dropped on 2026-07-28 — do not add badges for them here. */
  const PLATFORMS = [
    { label: "Linux", ready: true },
    { label: "Windows", ready: false },
  ];

  /* Illustrative, not a live reading of the visitor's machine — this page cannot
     see any of that, and pretending otherwise would be the exact dishonesty the
     product is against. The footnote says so. */
  const SAMPLE = [
    { label: "encrypted dns", verdict: "on", state: "ok" },
    { label: "vpn tunnel", verdict: "on", state: "ok" },
    { label: "ipv6 leak guard", verdict: "leaking", state: "warn" },
    { label: "disk encryption", verdict: "off", state: "off" },
  ];

  class VeilWidget extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });

      // A stylesheet link rather than an inline <style>: the site's CSP is
      // style-src 'self' with no unsafe-inline, and this keeps it that way.
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "/css/veil-widget.css";
      root.append(styles, this.#build());
    }

    #build() {
      const shell = el("div", "shell");
      const core = el("div", "core");

      core.append(
        text(el("p", "eyebrow"), "something I use"),
        text(el("h3", "title"), "Veil"),
        this.#blurb(),
        this.#readout(),
        this.#actions(),
        text(
          el("p", "footnote"),
          "Reading shown is an example, not your machine — this page cannot see " +
            "any of that. Veil protects against passive and mass surveillance. " +
            "It is not anonymity."
        )
      );

      shell.append(core);
      return shell;
    }

    #blurb() {
      const p = el("p", "line");
      p.append(
        "Reads what your machine is actually giving away — ",
        strong("dns, tunnel, firewall, ipv6, disk"),
        " — tells you plainly which ones are open, and gives you the exact " +
          "commands to close them. it has a licence layer now too, which was a lot " +
          "less fun to build than the part that does the real work."
      );
      return p;
    }

    #readout() {
      const list = el("ul", "readout");
      for (const row of SAMPLE) {
        const item = document.createElement("li");
        const dot = el("span", "dot");
        if (row.state !== "ok") dot.classList.add(`dot--${row.state}`);
        item.append(dot, document.createTextNode(row.label), text(el("span", "verdict"), row.verdict));
        list.append(item);
      }
      return list;
    }

    #actions() {
      const wrap = el("div", "actions");

      const cta = el("a", "cta");
      cta.href = VEIL_URL;
      cta.rel = "noopener";
      cta.textContent = "Have a look";

      const platforms = el("div", "platforms");
      for (const { label, ready } of PLATFORMS) {
        const badge = el("span", "platform");
        if (!ready) badge.classList.add("platform--soon");
        badge.textContent = ready ? label : `${label} soon`;
        platforms.append(badge);
      }

      wrap.append(cta, platforms);
      return wrap;
    }
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  function text(node, value) {
    node.textContent = value;
    return node;
  }

  function strong(value) {
    const node = document.createElement("strong");
    node.textContent = value;
    return node;
  }

  customElements.define("veil-widget", VeilWidget);
})();
