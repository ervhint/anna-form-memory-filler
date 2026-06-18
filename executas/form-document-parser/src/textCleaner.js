"use strict";

function cleanText(input) {
  if (input === null || input === undefined) {
    return "";
  }

  return String(input)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map(cleanLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(line) {
  return String(line)
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/^\s*([*•-])\s+/u, "$1 ")
    .trim();
}

module.exports = {
  cleanText,
  cleanLine,
};
