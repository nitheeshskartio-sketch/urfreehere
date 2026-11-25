import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from 'lucide-react';
import { splitName } from '../lib/format';

const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'dmg', 'iso']);
const CODE = new Set(['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'yml', 'yaml', 'xml', 'sql', 'rb', 'php', 'swift', 'kt']);
const SHEET = new Set(['xls', 'xlsx', 'csv', 'ods', 'numbers', 'tsv']);
const TEXT = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages', 'ppt', 'pptx', 'key', 'epub']);

export function FileIcon({ name, type, className = 'size-5' }: { name: string; type?: string; className?: string }) {
  const { ext } = splitName(name);
  const mime = type ?? '';
  let Icon = File;
  if (mime.startsWith('image/')) Icon = FileImage;
  else if (mime.startsWith('video/')) Icon = FileVideo;
  else if (mime.startsWith('audio/')) Icon = FileAudio;
  else if (ARCHIVE.has(ext)) Icon = FileArchive;
  else if (SHEET.has(ext)) Icon = FileSpreadsheet;
  else if (CODE.has(ext)) Icon = FileCode;
  else if (TEXT.has(ext) || mime.startsWith('text/')) Icon = FileText;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}

export function fileKind(name: string, type?: string): string {
  const { ext } = splitName(name);
  if (ext) return ext.toUpperCase();
  if (type) return type.split('/')[0].replace(/^\w/, (c) => c.toUpperCase());
  return 'File';
}
