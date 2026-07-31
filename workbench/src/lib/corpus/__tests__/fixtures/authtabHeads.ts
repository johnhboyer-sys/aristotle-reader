/**
 * Real bytes from the head of two AUTHTAB.DIR files — the header record plus
 * the first 20 author records of a 1999 TLG disc and a 1991 PHI disc, cut at a
 * record boundary.
 *
 * These are the disc's INDEX — author ids and names — not its texts. No
 * licensed text is reproduced here, and nothing in this file is readable as
 * a work: it is a table of contents, kept so the parser has coverage on
 * machines that have no disc (see authtabLive.test.ts, which needs one).
 *
 * Base64 because the source is binary: control bytes, 0xFF terminators, and
 * the 0x83 language markers do not survive a text file.
 */

export const TLG_AUTHTAB_HEAD_B64 =
  'KlRMRwAA31JUTEcgR3JlZWsgRGF0YSBCYW5rg2f/VExHMDExNiAmMUFieWRlbnVzICZIaXN0Lv9U' +
  'TEcyMDY0ICYxQWNhY2l1cyAmVGhlb2wu/1RMRzE4MzIgJjFBY2VzYW5kZXIgJkhpc3Qu//9UTEcw' +
  'MzA5ICYxQWNoYWV1cyAmVHJhZy7//1RMRzIxMzMgJjFBY2hpbGxlcyBUYXRpdXMgJkFzdHJvbi7/' +
  '/1RMRzA1MzIgJjFBY2hpbGxlcyBUYXRpdXMgJlNjci4gRXJvdC7/VExHMjU0NSBHYWl1cyAmMUFj' +
  'aWxpdXMgJkhpc3QuIGV0IFBoaWwu/1RMRzMxNDEgR2VvcmdpdXMgJjFBY3JvcG9saXRlcyAmSGlz' +
  'dC7/VExHMDMwMCAmMUFjdGEgQWxleGFuZHJpbm9ydW0m//9UTEcyOTQ5ICYxQWN0YSBCYXJuYWJh' +
  'ZSb//1RMRzAzMDQgJjFBY3RhIEV0IE1hcnR5cml1bSBBcG9sbG9uaWkm//9UTEcyMDEyICYxQWN0' +
  'YSBFdXBsaSb/VExHMDMxNyAmMUFjdGEgSm9hbm5pcyb/VExHMDM4NCAmMUFjdGEgSnVzdGluaSBF' +
  'dCBTZXB0ZW0gU29kYWxpdW0m/w==';

export const PHI_AUTHTAB_HEAD_B64 =
  'KkxBVAAAL+hMYXRpbiBUZXh0c/9MQVQyMDAwICYxQWJsYWJpdXMmg2z/TEFUMDQwMCBMdWNpdXMg' +
  'JjFBY2NpdXMmg2z//0xBVDA0MDIgVmFsZXJpdXMgJjFBZWRpdHV1cyaDbP//TEFUMjMwMCAmMUFl' +
  'bWlsaXVzJiBTdXJhg2z//0xBVDA0MDQgTHVjaXVzICYxQWZyYW5pdXMmg2z//0xBVDA5MDIgSXVs' +
  'aXVzICYxQWZyaWNhbnVzJoNs/0xBVDAzMDEgR25hZXVzIERvbWl0aXVzICYxQWhlbm9iYXJidXMm' +
  'g2z//0xBVDIwMDIgJjFBbGJpbnVzJiwgcG9ldC6DbP9MQVQwNDA2IFB1YmxpdXMgJjFBbGZlbnVz' +
  'JiBWYXJ1c4Ns//9MQVQxNTAwICYxQWx0ZXJjYXRpbyYgSGFkci4gZXQgRXBpY3RldGmDbP9MQVQx' +
  'MjA2IEx1Y2l1cyAmMUFtcGVsaXVzJoNs//9MQVQwMDk0IEx1Y2l1cyBMaXZpdXMgJjFBbmRyb25p' +
  'Y3VzJoNs/0xBVDEyMDkgJjFBbm5pYW51cyaDbP8=';
