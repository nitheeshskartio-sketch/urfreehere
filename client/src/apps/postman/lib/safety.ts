/**
 * Heuristic safety checks for received files.
 *
 * This is NOT antivirus scanning: files never pass through a server, and a
 * browser cannot scan them for malware. These checks catch the common tricks
 * used to make a harmful file look harmless, so the user can make an informed
 * decision before opening it.
 */

export type RiskLevel = 'high' | 'medium';

export interface FileWarning {
  level: RiskLevel;
  message: string;
}

/** Files that run code when opened on Windows, macOS, Linux or Android. */
const EXECUTABLE = new Set([
  // Windows
  'exe', 'com', 'scr', 'pif', 'msi', 'msp', 'msix', 'appx', 'appxbundle', 'dll', 'cpl', 'sys', 'drv', 'ocx',
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'hta', 'lnk', 'url', 'scf',
  'reg', 'inf', 'gadget', 'application', 'msc', 'jar', 'chm', 'library-ms', 'settingcontent-ms', 'appref-ms',
  // macOS / Linux
  'app', 'command', 'tool', 'pkg', 'mpkg', 'run', 'elf',
  'deb', 'rpm', 'appimage', 'workflow', 'scpt', 'applescript',
  // Android
  'apk', 'xapk', 'apks', 'aab',
]);

/** Plain scripts: commonly shared source code, but they run commands if executed. */
const SCRIPT = new Set(['js', 'mjs', 'sh', 'bash', 'zsh', 'csh', 'ksh', 'fish', 'py', 'pl', 'rb']);

/** Documents that can carry macros or scripts. */
const ACTIVE_CONTENT = new Set([
  'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'mht', 'mhtml',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm', 'sldm',
]);

/** Disk images: often used to slip programs past "downloaded from the internet" checks. */
const DISK_IMAGE = new Set(['iso', 'img', 'vhd', 'vhdx', 'dmg']);

/** Extensions people trust, often used as decoys: "invoice.pdf.exe". */
const DECOY = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'zip',
]);

/** Unicode direction overrides and invisible characters used to disguise names. */
const DISGUISE_CHARS = /[​-‏‪-‮⁦-⁩؜﻿]/;

function extensions(name: string): string[] {
  return name
    .toLowerCase()
    .split('.')
    .slice(1)
    .map((e) => e.trim());
}

/** Checks the name and declared type as sent by the other device (before sanitizing). */
export function inspectName(rawName: string, type: string): FileWarning[] {
  const warnings: FileWarning[] = [];
  const exts = extensions(rawName.replace(DISGUISE_CHARS, ''));
  const last = exts[exts.length - 1] ?? '';
  const previous = exts[exts.length - 2] ?? '';

  if (DISGUISE_CHARS.test(rawName)) {
    warnings.push({ level: 'high', message: 'The name contains hidden characters that can disguise the real file type.' });
  }
  if ((EXECUTABLE.has(last) || SCRIPT.has(last)) && DECOY.has(previous)) {
    warnings.push({ level: 'high', message: `Disguised program: looks like .${previous} but is a .${last} file.` });
  } else if (EXECUTABLE.has(last)) {
    warnings.push({ level: 'high', message: `.${last} files can run programs on your device.` });
  } else if (SCRIPT.has(last)) {
    warnings.push({ level: 'medium', message: `.${last} is a script. It can run commands if you execute it.` });
  } else if (ACTIVE_CONTENT.has(last)) {
    warnings.push({ level: 'medium', message: `.${last} files can contain scripts or macros.` });
  } else if (DISK_IMAGE.has(last)) {
    warnings.push({ level: 'medium', message: 'Disk images can contain programs that skip some security checks when opened.' });
  }
  if (/\s{3,}|\.{2,}\s*$|[\s.]+\.[^.]+$/.test(rawName) && !warnings.some((w) => w.level === 'high')) {
    warnings.push({ level: 'medium', message: 'Unusual spacing in the name can hide the real extension.' });
  }
  if (/^(text\/html|application\/xhtml|image\/svg|application\/x-msdownload|application\/x-sh)/i.test(type) && !warnings.length) {
    warnings.push({ level: 'medium', message: 'The sender marked this file as content that can run scripts.' });
  }
  return warnings;
}

type Signature = 'exe-windows' | 'exe-elf' | 'exe-macho' | 'script' | 'pdf' | 'png' | 'jpeg' | 'gif' | 'zip' | 'html';

function detect(b: Uint8Array): Signature | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (at(0, 0x4d, 0x5a)) return 'exe-windows'; // "MZ"
  if (at(0, 0x7f, 0x45, 0x4c, 0x46)) return 'exe-elf';
  if (at(0, 0xcf, 0xfa, 0xed, 0xfe) || at(0, 0xce, 0xfa, 0xed, 0xfe) || at(0, 0xfe, 0xed, 0xfa, 0xcf) || at(0, 0xfe, 0xed, 0xfa, 0xce)) return 'exe-macho';
  if (at(0, 0x23, 0x21)) return 'script'; // "#!"
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'pdf';
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return 'zip';
  const head = new TextDecoder().decode(b).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<script')) return 'html';
  return null;
}

/** What each common extension's content should look like. */
const EXPECTED: Record<string, Signature[]> = {
  pdf: ['pdf'],
  png: ['png'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  gif: ['gif'],
  docx: ['zip'],
  xlsx: ['zip'],
  pptx: ['zip'],
  zip: ['zip'],
};

const PROGRAM: Signature[] = ['exe-windows', 'exe-elf', 'exe-macho', 'script'];
const PROGRAM_LABEL: Partial<Record<Signature, string>> = {
  'exe-windows': 'a Windows program',
  'exe-elf': 'a Linux program',
  'exe-macho': 'a macOS program',
  script: 'a script',
};

/**
 * Reads the first bytes of a received file and compares them with its
 * extension, catching e.g. a Windows program renamed to "photo.jpg".
 */
export async function inspectContent(blob: Blob, name: string): Promise<FileWarning[]> {
  if (blob.size === 0) return [];
  let head: Uint8Array;
  try {
    head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  } catch {
    return [];
  }
  const sig = detect(head);
  if (!sig) return [];
  const ext = extensions(name).pop() ?? '';

  if (sig === 'script' && SCRIPT.has(ext)) return [];
  if (PROGRAM.includes(sig) && !EXECUTABLE.has(ext)) {
    return [{ level: 'high', message: `The contents are ${PROGRAM_LABEL[sig]}, but the name ends in .${ext || '(none)'}.` }];
  }
  if (sig === 'html' && !ACTIVE_CONTENT.has(ext) && ext !== 'txt') {
    return [{ level: 'medium', message: `The contents are a web page, but the name ends in .${ext || '(none)'}.` }];
  }
  const expected = EXPECTED[ext];
  if (expected && !expected.includes(sig)) {
    return [{ level: 'medium', message: `The contents don't match the .${ext} extension.` }];
  }
  return [];
}

export function highestLevel(warnings: FileWarning[] | undefined): RiskLevel | null {
  if (!warnings?.length) return null;
  return warnings.some((w) => w.level === 'high') ? 'high' : 'medium';
}
