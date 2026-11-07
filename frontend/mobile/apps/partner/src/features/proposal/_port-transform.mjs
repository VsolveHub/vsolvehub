/**
 * Mechanical web→RN transform for the proposal view ports.
 * Run once, then delete.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("../../../../../../node_modules/typescript/lib/typescript.js");

const WEB = path.resolve("frontend/apps/partner/features/proposal/view");
const MOBILE = path.resolve("frontend/mobile/apps/partner/src/features/proposal/view");

const FILES = [
  "onsite-screen.tsx",
  "commercial-estimate-flow.tsx",
  "rate-card-estimate-composer.tsx",
  "commercial-estimate-composer.tsx",
  "tap-estimate.tsx",
  "tap-estimate-composer.tsx",
  "proposal-status.tsx",
  "estimate-preview-sheet.tsx",
  "money-pad.tsx",
  "overall-discount-dialog.tsx",
  "parts/inline-quantity-control.tsx",
];

const VIEW_TAGS = new Set([
  "div", "section", "main", "header", "nav", "footer", "ul", "li", "ol", "form", "aside", "dl", "article",
]);
const TEXT_TAGS = new Set(["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "label", "strong", "dt", "dd", "summary"]);
const INPUT_TAGS = new Set(["input", "Input", "textarea", "Textarea"]);

const ICON_COLORS = [
  ["text-action-active", "#d65e00"],
  ["text-action-secondary", "#00246b"],
  ["text-action-text", "#00112e"],
  ["text-action", "#f87000"],
  ["text-text-secondary", "#453f37"],
  ["text-text-muted", "#756c5e"],
  ["text-text-inverse", "#ffffff"],
  ["text-text-link", "#00246b"],
  ["text-warning-text", "#8a5a00"],
  ["text-danger-text", "#8f1e17"],
  ["text-success-text", "#166534"],
  ["text-info-text", "#00246b"],
  ["text-signal-300", "#ff9e63"],
  ["text-surface", "#ffffff"],
  ["text-text", "#00112e"],
  ["text-warm-400", "#a89f90"],
  ["text-warm-600", "#5f584d"],
];

const SIZE_PX = { 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 };

const f = ts.factory;

function cleanClassString(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const kept = [];
  let cols = null;
  let sawGrid = false;
  let arbitraryRow = false;
  for (const token of tokens) {
    if (/^(sm|md|lg|xl|2xl|hover|focus-visible|focus|group-hover|group-open|print):/.test(token)) continue;
    if (/^min-\[(?!360px)/.test(token)) continue;
    let bare = token;
    if (token.startsWith("min-[360px]:")) bare = token.slice("min-[360px]:".length);
    if (/^(transition|duration-|ease-|cursor-|motion-|touch-manipulation|animate-)/.test(bare)) continue;
    if (bare === "grid" || bare === "inline-grid") {
      sawGrid = true;
      continue;
    }
    if (/^grid-cols-\d+$/.test(bare)) {
      cols = bare;
      continue;
    }
    if (/^grid-cols-\[/.test(bare)) {
      sawGrid = true;
      arbitraryRow = true;
      continue;
    }
    if (/^space-y-(\d+|px|0\.5|1\.5|2\.5|3\.5)$/.test(bare)) {
      kept.push(bare.replace("space-y-", "gap-"));
      continue;
    }
    if (/^space-x-/.test(bare)) {
      kept.push(bare.replace("space-x-", "gap-"));
      continue;
    }
    if (bare.startsWith("pb-[max(") && bare.includes("safe-area")) continue;
    kept.push(bare);
  }
  if (sawGrid) kept.unshift("flex-row", "flex-wrap");
  const childWidth =
    cols === "grid-cols-2" ? "w-[48%]" : cols === "grid-cols-3" ? "w-[31%]" : cols === "grid-cols-4" ? "w-[23%]" : null;
  return { className: [...new Set(kept)].join(" "), childWidth, arbitraryRow };
}

function isTextToken(token) {
  return /^(text-|font-|leading-|tracking-|tabular-nums|uppercase|lowercase|italic|underline|line-through|whitespace-|truncate|line-clamp-)/.test(token);
}

function splitTextClasses(className) {
  const tokens = className.split(/\s+/).filter(Boolean);
  const text = [];
  const box = [];
  for (const token of tokens) {
    if (isTextToken(token)) text.push(token);
    else box.push(token);
  }
  return { text: text.join(" "), box: box.join(" ") };
}

function lineClamp(className) {
  const clamp = className.match(/line-clamp-(\d+)/);
  if (clamp) return Number(clamp[1]);
  if (className.split(/\s+/).includes("truncate")) return 1;
  return null;
}

function transformClassExpr(expr) {
  if (!expr) return { expr, childWidth: null, arbitraryRow: false };
  if (ts.isStringLiteral(expr)) {
    const cleaned = cleanClassString(expr.text);
    return { expr: f.createStringLiteral(cleaned.className), childWidth: cleaned.childWidth, arbitraryRow: cleaned.arbitraryRow };
  }
  if (ts.isNoSubstitutionTemplateLiteral(expr)) {
    const cleaned = cleanClassString(expr.text);
    return { expr: f.createNoSubstitutionTemplateLiteral(cleaned.className), childWidth: cleaned.childWidth, arbitraryRow: cleaned.arbitraryRow };
  }
  if (ts.isTemplateExpression(expr)) {
    let childWidth = null;
    let arbitraryRow = false;
    const headClean = cleanClassString(expr.head.text);
    if (headClean.childWidth) childWidth = headClean.childWidth;
    if (headClean.arbitraryRow) arbitraryRow = true;
    const spans = expr.templateSpans.map((span) => {
      const cleaned = cleanClassString(span.literal.text);
      if (cleaned.childWidth) childWidth = cleaned.childWidth;
      if (cleaned.arbitraryRow) arbitraryRow = true;
      return f.createTemplateSpan(
        span.expression,
        span.literal.rawText !== undefined && ts.isTemplateMiddle(span.literal)
          ? f.createTemplateMiddle(cleaned.className)
          : f.createTemplateTail(cleaned.className),
      );
    });
    return { expr: f.createTemplateExpression(f.createTemplateHead(headClean.className), spans), childWidth, arbitraryRow };
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "cn") {
    let childWidth = null;
    let arbitraryRow = false;
    const args = expr.arguments.map((arg) => {
      const next = transformClassExpr(arg);
      if (next.childWidth) childWidth = next.childWidth;
      if (next.arbitraryRow) arbitraryRow = true;
      return next.expr;
    });
    return { expr: f.updateCallExpression(expr, expr.expression, expr.typeArguments, args), childWidth, arbitraryRow };
  }
  if (ts.isParenthesizedExpression(expr)) {
    const inner = transformClassExpr(expr.expression);
    return { ...inner, expr: f.createParenthesizedExpression(inner.expr) };
  }
  if (ts.isConditionalExpression(expr)) {
    const whenTrue = transformClassExpr(expr.whenTrue);
    const whenFalse = transformClassExpr(expr.whenFalse);
    return {
      expr: f.updateConditionalExpression(expr, expr.condition, expr.questionToken, whenTrue.expr, expr.colonToken, whenFalse.expr),
      childWidth: whenTrue.childWidth ?? whenFalse.childWidth,
      arbitraryRow: whenTrue.arbitraryRow || whenFalse.arbitraryRow,
    };
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const right = transformClassExpr(expr.right);
    return { ...right, expr: f.updateBinaryExpression(expr, expr.left, expr.operatorToken, right.expr) };
  }
  return { expr, childWidth: null, arbitraryRow: false };
}

function attrName(attr) {
  return ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) ? attr.name.text : null;
}

function attrValueExpr(attr) {
  if (!ts.isJsxAttribute(attr) || !attr.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer;
  if (ts.isJsxExpression(attr.initializer)) return attr.initializer.expression ?? null;
  return null;
}

function jsxAttr(name, initializer) {
  return f.createJsxAttribute(f.createIdentifier(name), initializer);
}

function jsxString(name, value) {
  return jsxAttr(name, f.createStringLiteral(value));
}

function jsxExprAttr(name, expression) {
  return jsxAttr(name, f.createJsxExpression(undefined, expression));
}

function hasElementChild(node) {
  if (!ts.isJsxElement(node)) return false;
  return node.children.some((child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return true;
    if (ts.isJsxExpression(child) && child.expression) return true;
    return false;
  });
}

function tagOf(node) {
  const name = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return ts.isIdentifier(name) ? name.text : null;
}

function openingOf(node) {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function collectStrings(expr, into) {
  if (!expr) return;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) into.push(expr.text);
  else if (ts.isTemplateExpression(expr)) {
    into.push(expr.head.text);
    for (const span of expr.templateSpans) into.push(span.literal.text);
  } else if (ts.isCallExpression(expr)) expr.arguments.forEach((arg) => collectStrings(arg, into));
  else if (ts.isConditionalExpression(expr)) {
    collectStrings(expr.whenTrue, into);
    collectStrings(expr.whenFalse, into);
  } else if (ts.isBinaryExpression(expr)) {
    collectStrings(expr.left, into);
    collectStrings(expr.right, into);
  } else if (ts.isParenthesizedExpression(expr)) collectStrings(expr.expression, into);
}

function iconSizeAndColor(classExpr) {
  const texts = [];
  collectStrings(classExpr, texts);
  const joined = texts.join(" ");
  let size = 24;
  const sizeMatch = joined.match(/size-(\d+)/);
  if (sizeMatch && SIZE_PX[sizeMatch[1]]) size = SIZE_PX[sizeMatch[1]];
  let color = "#00112e";
  for (const [token, hex] of ICON_COLORS) {
    if (joined.includes(token)) {
      color = hex;
      break;
    }
  }
  const dynamic = texts.some((text) => text.includes("text-")) && ts.isConditionalExpression(classExpr);
  return { size, color, dynamic };
}

function colorExprFrom(expr) {
  if (!expr) return f.createStringLiteral("#00112e");
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    let color = "#00112e";
    for (const [token, hex] of ICON_COLORS) {
      if (expr.text.includes(token)) {
        color = hex;
        break;
      }
    }
    return f.createStringLiteral(color);
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "cn") {
    const conditional = expr.arguments.find((arg) => ts.isConditionalExpression(arg) || (ts.isBinaryExpression(arg)));
    if (conditional) return colorExprFrom(conditional);
    return colorExprFrom(expr.arguments.find((arg) => ts.isStringLiteral(arg)) ?? null);
  }
  if (ts.isConditionalExpression(expr)) {
    return f.createConditionalExpression(
      expr.condition,
      expr.questionToken,
      colorExprFrom(expr.whenTrue),
      expr.colonToken,
      colorExprFrom(expr.whenFalse),
    );
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return f.createConditionalExpression(
      expr.left,
      f.createToken(ts.SyntaxKind.QuestionToken),
      colorExprFrom(expr.right),
      f.createToken(ts.SyntaxKind.ColonToken),
      f.createStringLiteral("#00112e"),
    );
  }
  if (ts.isParenthesizedExpression(expr)) return colorExprFrom(expr.expression);
  return f.createStringLiteral("#00112e");
}

function replaceMemberValue(node, eventName) {
  const visit = (current) => {
    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === "value" &&
      ts.isPropertyAccessExpression(current.expression) &&
      (current.expression.name.text === "target" || current.expression.name.text === "currentTarget") &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === eventName
    ) {
      return f.createIdentifier("value");
    }
    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === "select" &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "currentTarget"
    ) {
      return f.createIdentifier("undefined");
    }
    return ts.visitEachChild(current, visit, ts.nullTransformationContext);
  };
  return visit(node);
}

function rewriteValueHandler(initializer) {
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null;
  const expr = initializer.expression;
  if (!ts.isArrowFunction(expr) || expr.parameters.length === 0) return null;
  const param = expr.parameters[0];
  if (!ts.isIdentifier(param.name)) return null;
  const body = replaceMemberValue(expr.body, param.name.text);
  const next = f.createArrowFunction(undefined, undefined, [f.createParameterDeclaration(undefined, undefined, "value")], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), body);
  return f.createJsxExpression(undefined, next);
}

function appendClass(attributes, extra) {
  const list = [...attributes];
  const index = list.findIndex((attr) => attrName(attr) === "className");
  if (index === -1) {
    list.push(jsxString("className", extra));
    return list;
  }
  const attr = list[index];
  const expr = attrValueExpr(attr);
  let nextExpr;
  if (expr && ts.isStringLiteral(expr)) nextExpr = f.createStringLiteral(`${expr.text} ${extra}`.trim());
  else if (expr) {
    nextExpr = f.createCallExpression(f.createIdentifier("cn"), undefined, [expr, f.createStringLiteral(extra)]);
  } else nextExpr = f.createStringLiteral(extra);
  list[index] = jsxAttr("className", ts.isStringLiteral(nextExpr) ? nextExpr : f.createJsxExpression(undefined, nextExpr));
  return list;
}

function widenChild(node, width) {
  if (!width) return node;
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const open = openingOf(node);
    const existing = open.attributes.properties.find((attr) => attrName(attr) === "className");
    const texts = [];
    if (existing) collectStrings(attrValueExpr(existing), texts);
    if (texts.join(" ").match(/\bw-|flex-1/)) return node;
    const properties = appendClass(open.attributes.properties, width);
    const attrs = f.createJsxAttributes(properties);
    if (ts.isJsxSelfClosingElement(node)) {
      return f.updateJsxSelfClosingElement(node, node.tagName, node.typeArguments, attrs);
    }
    return f.updateJsxElement(node, f.updateJsxOpeningElement(open, open.tagName, open.typeArguments, attrs), node.children, node.closingElement);
  }
  if (ts.isJsxExpression(node) && node.expression) {
    const next = widenExpression(node.expression, width);
    return f.updateJsxExpression(node, next);
  }
  return node;
}

function widenExpression(expr, width) {
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) return widenChild(expr, width);
  if (ts.isParenthesizedExpression(expr)) return f.updateParenthesizedExpression(expr, widenExpression(expr.expression, width));
  if (ts.isConditionalExpression(expr)) {
    return f.updateConditionalExpression(
      expr,
      expr.condition,
      expr.questionToken,
      widenExpression(expr.whenTrue, width),
      expr.colonToken,
      widenExpression(expr.whenFalse, width),
    );
  }
  if (ts.isCallExpression(expr) && expr.arguments.length > 0) {
    const args = expr.arguments.map((arg) => {
      if (ts.isArrowFunction(arg)) {
        const body = ts.isBlock(arg.body) ? arg.body : widenExpression(arg.body, width);
        return f.updateArrowFunction(arg, arg.modifiers, arg.typeParameters, arg.parameters, arg.type, arg.equalsGreaterThanToken, body);
      }
      return arg;
    });
    return f.updateCallExpression(expr, expr.expression, expr.typeArguments, args);
  }
  if (ts.isArrowFunction(expr) && !ts.isBlock(expr.body)) {
    return f.updateArrowFunction(expr, expr.modifiers, expr.typeParameters, expr.parameters, expr.type, expr.equalsGreaterThanToken, widenExpression(expr.body, width));
  }
  return expr;
}

const lucideNames = new Set();

function isIconTag(tag) {
  return tag !== null && (lucideNames.has(tag) || tag === "Icon");
}

function transformJsx(node) {
  if (ts.isJsxText(node) || ts.isJsxFragment(node)) {
    if (ts.isJsxFragment(node)) {
      return f.updateJsxFragment(node, node.openingFragment, node.children.map(transformJsx), node.closingFragment);
    }
    return node;
  }
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return node;

  const tag = tagOf(node);
  const open = openingOf(node);
  const children = ts.isJsxElement(node) ? node.children.map(transformJsx) : [];
  const mixed = children.some((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || (ts.isJsxExpression(child) && child.expression && !ts.isStringLiteral(child.expression)));

  if (tag && isIconTag(tag)) {
    const classAttr = open.attributes.properties.find((attr) => attrName(attr) === "className");
    const classExpr = classAttr ? attrValueExpr(classAttr) : null;
    const { size } = iconSizeAndColor(classExpr);
    const color = colorExprFrom(classExpr);
    const attrs = [
      jsxExprAttr("size", f.createNumericLiteral(size)),
      jsxExprAttr("color", color),
    ];
    return f.createJsxSelfClosingElement(f.createIdentifier(tag), undefined, f.createJsxAttributes(attrs));
  }

  let nextTag = tag;
  let role = "view";
  if (tag && VIEW_TAGS.has(tag)) nextTag = "View";
  else if (tag === "button") {
    nextTag = "Pressable";
    role = "button";
  } else if (tag && TEXT_TAGS.has(tag)) nextTag = mixed ? "View" : "Text";
  else if (tag === "input") nextTag = "Input";
  else if (tag === "textarea") nextTag = "Textarea";
  else if (tag === "a") nextTag = "Link";

  const props = [];
  let classMeta = { expr: null, childWidth: null, arbitraryRow: false };
  let textClass = "";
  let lines = null;
  let needsPressableText = nextTag === "Pressable";
  const isField = nextTag === "Input" || nextTag === "Textarea";

  for (const attr of open.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) {
      props.push(attr);
      continue;
    }
    const name = attrName(attr);
    if (name === "className") {
      const expr = attrValueExpr(attr);
      classMeta = transformClassExpr(expr);
      const staticText = [];
      collectStrings(classMeta.expr, staticText);
      const joined = staticText.join(" ");
      lines = lineClamp(joined);
      if (nextTag === "Pressable" || (nextTag === "View" && mixed && TEXT_TAGS.has(tag))) {
        const split = splitTextClasses(classMeta.expr && ts.isStringLiteral(classMeta.expr) ? classMeta.expr.text : joined);
        textClass = split.text;
        if (ts.isStringLiteral(classMeta.expr)) classMeta = { ...classMeta, expr: f.createStringLiteral(split.box) };
      }
      if (classMeta.expr && !(ts.isStringLiteral(classMeta.expr) && classMeta.expr.text === "")) {
        props.push(jsxAttr("className", ts.isStringLiteral(classMeta.expr) ? classMeta.expr : f.createJsxExpression(undefined, classMeta.expr)));
      }
      continue;
    }
    if (name === "type" && (tag === "button" || tag === "input" || tag === "Button")) continue;
    if (name === "pattern" || name === "tabIndex" || name === "htmlFor") continue;
    if (name === "aria-hidden") continue;
    if (name === "onClick" && (nextTag === "Pressable" || nextTag === "Link")) {
      props.push(jsxAttr("onPress", attr.initializer));
      continue;
    }
    if (name === "onChange" && isField) {
      const rewritten = attr.initializer ? rewriteValueHandler(attr.initializer) : null;
      props.push(jsxAttr("onChangeText", rewritten ?? attr.initializer));
      continue;
    }
    if (name === "onKeyDown") continue;
    if (name === "inputMode") {
      const value = attr.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : "";
      const keyboard = value === "numeric" ? "number-pad" : value === "decimal" ? "decimal-pad" : value === "tel" ? "phone-pad" : null;
      if (keyboard) props.push(jsxString("keyboardType", keyboard));
      continue;
    }
    if (name === "aria-label" || name === "aria-labelledby") {
      props.push(jsxAttr("accessibilityLabel", attr.initializer));
      continue;
    }
    if (name === "aria-live" || (name === "role" && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === "status")) {
      props.push(jsxString("accessibilityLiveRegion", "polite"));
      if (name === "role") continue;
      continue;
    }
    if (name === "role") {
      const value = attr.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : "";
      const mapped = { button: "button", radio: "radio", tab: "tab", alert: "alert", summary: "button" }[value];
      if (mapped) props.push(jsxString("accessibilityRole", mapped));
      continue;
    }
    if (name === "aria-pressed" || name === "aria-checked" || name === "aria-selected" || name === "aria-expanded") {
      const key = name === "aria-pressed" || name === "aria-selected" ? "selected" : name === "aria-checked" ? "checked" : "expanded";
      const expr = attrValueExpr(attr);
      if (expr && !ts.isStringLiteral(expr)) {
        props.push(jsxExprAttr("accessibilityState", f.createObjectLiteralExpression([f.createPropertyAssignment(key, expr)], false)));
      }
      continue;
    }
    if (name === "href" && nextTag === "Link") {
      props.push(attr);
      continue;
    }
    props.push(attr);
  }

  if (nextTag === "Pressable" && !props.some((attr) => attrName(attr) === "accessibilityRole")) {
    props.unshift(jsxString("accessibilityRole", "button"));
  }
  if (nextTag === "Text" && lines) props.push(jsxExprAttr("numberOfLines", f.createNumericLiteral(lines)));
  if (isField && children.length === 0) {
    const hadSelect = open.attributes.properties.some((attr) => {
      if (attrName(attr) !== "onFocus") return false;
      const expr = attrValueExpr(attr);
      const texts = [];
      collectStrings(expr, texts);
      return ts.isArrowFunction(expr) && expr.body.getText && false;
    });
    void hadSelect;
  }

  let nextChildren = children;
  if (classMeta.childWidth) nextChildren = nextChildren.map((child) => widenChild(child, classMeta.childWidth));
  if (classMeta.arbitraryRow) {
    nextChildren = nextChildren.map((child, index, all) => {
      const elements = all.filter((item) => ts.isJsxElement(item) || ts.isJsxSelfClosingElement(item));
      if (!(ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))) return child;
      const elementIndex = elements.indexOf(child);
      if (elements.length === 2 && elementIndex === 1) return widenChild(child, "flex-1");
      return child;
    });
  }

  if (needsPressableText || (nextTag === "View" && textClass)) {
    nextChildren = nextChildren.map((child) => wrapLooseText(child, textClass));
  }

  if (nextTag === "Link") {
    const pressableKids = nextChildren.map((child) => wrapLooseText(child, textClass || "text-sm font-semibold text-center"));
    const pressable = f.createJsxElement(
      f.createJsxOpeningElement(f.createIdentifier("Pressable"), undefined, f.createJsxAttributes([
        jsxString("accessibilityRole", "button"),
        ...props.filter((attr) => attrName(attr) !== "href"),
      ])),
      pressableKids,
      f.createJsxClosingElement(f.createIdentifier("Pressable")),
    );
    const href = props.find((attr) => attrName(attr) === "href");
    return f.createJsxElement(
      f.createJsxOpeningElement(f.createIdentifier("Link"), undefined, f.createJsxAttributes([
        href,
        jsxAttr("asChild", undefined),
      ].filter(Boolean))),
      [pressable],
      f.createJsxClosingElement(f.createIdentifier("Link")),
    );
  }

  const tagId = f.createIdentifier(nextTag ?? tag ?? "View");
  const attrs = f.createJsxAttributes(props.filter(Boolean));
  if (ts.isJsxSelfClosingElement(node) || nextChildren.every((child) => ts.isJsxText(child) && child.text.trim() === "")) {
    if (nextChildren.some((child) => ts.isJsxText(child) && child.text.trim() !== "")) {
      return f.createJsxElement(f.createJsxOpeningElement(tagId, undefined, attrs), nextChildren, f.createJsxClosingElement(tagId));
    }
    return f.createJsxSelfClosingElement(tagId, undefined, attrs);
  }
  return f.createJsxElement(
    f.createJsxOpeningElement(tagId, undefined, attrs),
    nextChildren,
    f.createJsxClosingElement(tagId),
  );
}

function wrapLooseText(child, textClass) {
  if (ts.isJsxText(child)) {
    if (child.text.trim() === "") return child;
    return f.createJsxElement(
      f.createJsxOpeningElement(f.createIdentifier("Text"), undefined, f.createJsxAttributes(textClass ? [jsxString("className", textClass)] : [])),
      [f.createJsxText(child.text)],
      f.createJsxClosingElement(f.createIdentifier("Text")),
    );
  }
  if (ts.isJsxExpression(child) && child.expression && !ts.isJsxElement(child.expression) && !ts.isJsxSelfClosingElement(child.expression) && !ts.isJsxFragment(child.expression)) {
    return f.updateJsxExpression(
      child,
      f.createJsxElement(
        f.createJsxOpeningElement(f.createIdentifier("Text"), undefined, f.createJsxAttributes(textClass ? [jsxString("className", textClass)] : [])),
        [f.createJsxExpression(undefined, child.expression)],
        f.createJsxClosingElement(f.createIdentifier("Text")),
      ),
    );
  }
  return child;
}

function rewriteImports(sourceFile) {
  const statements = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client") {
      continue;
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      statements.push(statement);
      continue;
    }
    const spec = statement.moduleSpecifier.text;
    if (spec === "next/link") {
      statements.push(f.createImportDeclaration(undefined, f.createImportClause(false, undefined, f.createNamedImports([f.createImportSpecifier(false, undefined, f.createIdentifier("Link"))])), f.createStringLiteral("expo-router")));
      continue;
    }
    if (spec === "next/navigation") {
      statements.push(f.createImportDeclaration(undefined, statement.importClause, f.createStringLiteral("expo-router")));
      continue;
    }
    if (spec === "@vsolve/ui") {
      statements.push(f.updateImportDeclaration(statement, statement.modifiers, statement.importClause, f.createStringLiteral("@vsolve/mobile-ui"), undefined));
      continue;
    }
    if (spec === "@vsolve/query") {
      statements.push(f.updateImportDeclaration(statement, statement.modifiers, statement.importClause, f.createStringLiteral("@vsolve/query/native"), undefined));
      continue;
    }
    if (spec === "lucide-react") {
      const clause = statement.importClause;
      if (clause && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        const elements = clause.namedBindings.elements.filter((el) => el.name.text !== "LucideIcon");
        for (const el of elements) lucideNames.add(el.name.text);
        statements.push(f.createImportDeclaration(undefined, f.createImportClause(false, undefined, f.createNamedImports(elements)), f.createStringLiteral("lucide-react-native")));
        statements.push(f.createImportDeclaration(
          undefined,
          f.createImportClause(true, undefined, f.createNamedImports([f.createImportSpecifier(false, undefined, f.createIdentifier("ComponentType"))])),
          f.createStringLiteral("react"),
        ));
      }
      continue;
    }
    if (spec === "@/components/pictogram") {
      const rel = sourceFile.fileName.includes(`${path.sep}parts${path.sep}`) ? "../pictogram" : "./pictogram";
      statements.push(f.updateImportDeclaration(statement, statement.modifiers, statement.importClause, f.createStringLiteral(rel), undefined));
      continue;
    }
    if (spec === "@/lib/format") continue;
    statements.push(statement);
  }
  return f.updateSourceFile(sourceFile, statements);
}

function ensureRuntimeImports(sourceText) {
  const needs = [];
  if (/\bView\b/.test(sourceText)) needs.push("View");
  if (/\bPressable\b/.test(sourceText)) needs.push("Pressable");
  if (/\bScrollView\b/.test(sourceText)) needs.push("ScrollView");
  const rn = needs.length
    ? `import { ${needs.join(", ")} } from "react-native";\n`
    : "";
  let text = sourceText;
  if (rn && !text.includes('from "react-native"')) {
    const firstImport = text.indexOf("import ");
    text = firstImport === -1 ? rn + text : text.slice(0, firstImport) + rn + text.slice(firstImport);
  }
  if (text.includes("<Text") && !text.includes("Text,") && !text.includes("{ Text }") && !text.includes(" Text ")) {
    text = text.replace('from "@vsolve/mobile-ui"', (match, offset, whole) => match);
    text = text.replace(/import \{([^}]+)\} from "@vsolve\/mobile-ui";/, (full, names) => {
      if (names.includes("Text")) return full;
      return `import {${names.replace(/\s+$/, "")}, Text } from "@vsolve/mobile-ui";`;
    });
  }
  if (/\bComponentType\b/.test(text) && text.includes("type LucideIcon")) {
    text = text.replace(/type LucideIcon/g, "ComponentType<{ size?: number; color?: string }>");
  }
  if (text.includes("LucideIcon")) {
    text = text.replace(/LucideIcon/g, "ComponentType<{ size?: number; color?: string }>");
  }
  if (text.includes("timeAgo(") && !text.includes("function timeAgo")) {
    text += `

function shortDate(d) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

function timeAgo(d) {
  const date = new Date(d);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
  return sameDay ? \`Today, \${time}\` : \`\${shortDate(date)}, \${time}\`;
}
`;
  }
  return text;
}

function transformFile(rel) {
  lucideNames.clear();
  const webPath = path.join(WEB, rel);
  let source = fs.readFileSync(webPath, "utf8");
  source = source.replaceAll("window.setTimeout", "setTimeout").replaceAll("window.clearTimeout", "clearTimeout");
  const sourceFile = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rewritten = rewriteImports(sourceFile);
  const transformed = ts.transform(rewritten, [
    (context) => (root) => {
      const visit = (node) => {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
          return transformJsx(node);
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "cn") {
          return transformClassExpr(node).expr;
        }
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          ts.isPropertyAccessExpression(node.left.expression) &&
          node.left.expression.name.text === "location" &&
          node.left.name.text === "href"
        ) {
          return f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier("router"), "push"), undefined, [node.right]);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(root, visit);
    },
  ]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  let printed = printer.printFile(transformed.transformed[0]);
  printed = ensureRuntimeImports(printed);
  const header = `// Ported from frontend/apps/partner/features/proposal/view/${rel.replaceAll("\\", "/")}\n`;
  const out = path.join(MOBILE, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, header + printed);
  console.log("wrote", rel, printed.split("\n").length);
}

for (const file of FILES) transformFile(file);
