"use strict";

(() => {
  const expressionPattern = /^\s*\{\{\s*(.*?)\s*\}\}\s*$/;
  const interpolationPattern = /\{\{\s*(.*?)\s*\}\}/g;

  class DCLogic {
    constructor() {
      this.state = this.state || {};
      this.__render = null;
    }

    setState(update, callback) {
      const patch = typeof update === "function" ? update(this.state) : update;
      this.state = { ...this.state, ...(patch || {}) };
      if (this.__render) this.__render();
      if (callback) callback();
    }

    forceUpdate() {
      if (this.__render) this.__render();
    }

    componentDidMount() {}
    componentDidUpdate() {}
    componentWillUnmount() {}
    renderVals() { return {}; }
  }

  function resolve(scope, expression) {
    const source = String(expression || "").trim();
    if (!source) return undefined;
    if (source === "true") return true;
    if (source === "false") return false;
    if (source === "null") return null;
    if (source[0] === "!") return !resolve(scope, source.slice(1));

    return source.split(".").reduce((value, key) => {
      if (value == null) return undefined;
      return value[key.trim()];
    }, scope);
  }

  function expressionValue(scope, value) {
    const match = String(value || "").match(expressionPattern);
    return match ? resolve(scope, match[1]) : value;
  }

  function interpolate(scope, value) {
    return String(value || "").replace(interpolationPattern, (_, expression) => {
      const resolved = resolve(scope, expression);
      return resolved == null ? "" : String(resolved);
    });
  }

  function processNode(node, scope) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = interpolate(scope, node.textContent);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    if (tag === "sc-if") {
      const fragment = document.createDocumentFragment();
      if (expressionValue(scope, node.getAttribute("value"))) {
        [...node.childNodes].forEach((child) => {
          const clone = child.cloneNode(true);
          processNode(clone, scope);
          fragment.appendChild(clone);
        });
      }
      node.replaceWith(fragment);
      return;
    }

    if (tag === "sc-for") {
      const list = expressionValue(scope, node.getAttribute("list"));
      const alias = node.getAttribute("as") || "item";
      const fragment = document.createDocumentFragment();

      (Array.isArray(list) ? list : []).forEach((item, index) => {
        const childScope = { ...scope, [alias]: item, $index: index };
        [...node.childNodes].forEach((child) => {
          const clone = child.cloneNode(true);
          processNode(clone, childScope);
          fragment.appendChild(clone);
        });
      });

      node.replaceWith(fragment);
      return;
    }

    [...node.attributes].forEach((attribute) => {
      const name = attribute.name;
      const value = attribute.value;

      if (name.toLowerCase() === "onclick") {
        const handler = expressionValue(scope, value);
        node.removeAttribute(name);
        if (typeof handler === "function") {
          node.addEventListener("click", (event) => handler(event));
        }
        return;
      }

      if (name === "style-hover") {
        const hoverStyle = value;
        const baseStyle = node.getAttribute("style") || "";
        node.removeAttribute(name);
        node.addEventListener("mouseenter", () => {
          node.setAttribute("style", `${baseStyle};${hoverStyle}`);
        });
        node.addEventListener("mouseleave", () => {
          node.setAttribute("style", baseStyle);
        });
        return;
      }

      if (value.includes("{{")) {
        node.setAttribute(name, interpolate(scope, value));
      }
    });

    [...node.childNodes].forEach((child) => processNode(child, scope));
  }

  function installHelmet(helmet) {
    if (!helmet) return;
    [...helmet.children].forEach((element) => {
      if (element.tagName === "META") {
        const name = element.getAttribute("name");
        if (name && document.head.querySelector(`meta[name="${name}"]`)) return;
      }
      document.head.appendChild(element.cloneNode(true));
    });
  }

  function boot() {
    const source = document.querySelector("x-dc");
    const logicScript = document.querySelector("script[data-dc-script]");
    if (!source || !logicScript) return;

    installHelmet(source.querySelector("helmet"));
    source.querySelector("helmet")?.remove();

    const templateSource = source.innerHTML;
    const mount = document.createElement("div");
    mount.id = "app";
    source.replaceWith(mount);

    let Component;
    try {
      Component = new Function(
        "DCLogic",
        `${logicScript.textContent}\nreturn Component;`
      )(DCLogic);
    } catch (error) {
      console.error("[Le Carnet du Verger] Initialisation impossible :", error);
      return;
    }

    const component = new Component();
    let mounted = false;
    let previousState = component.state;

    const render = () => {
      const template = document.createElement("template");
      template.innerHTML = templateSource;
      const values = { ...(component.renderVals() || {}) };
      [...template.content.childNodes].forEach((node) => processNode(node, values));
      mount.replaceChildren(template.content);

      if (mounted) component.componentDidUpdate(previousState);
      previousState = { ...component.state };
    };

    component.__render = render;
    render();
    mounted = true;
    component.componentDidMount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
