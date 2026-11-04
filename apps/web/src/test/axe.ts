import axe from 'axe-core';

/**
 * Everything axe finds wrong in the page, as readable lines; an empty list means
 * nothing. It catches what can be read from the HTML, like a missing label or
 * invalid ARIA. Not colour contrast: jsdom paints nothing and loads no CSS, so
 * that rule is off here and contrast is checked in Chrome instead. No tool
 * proves a page usable; this keeps the known mistakes from coming back.
 */
export async function a11yProblems(): Promise<string[]> {
  const { violations } = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return violations.flatMap((rule) =>
    rule.nodes.map((node) => `${rule.id}: ${rule.help} -> ${node.html}`),
  );
}
