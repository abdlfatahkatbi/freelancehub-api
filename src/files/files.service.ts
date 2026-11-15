import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

export type FilePurpose = 'avatar' | 'attachment' | 'delivery';

export interface MemoryFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

interface FileRule {
  maxSize: number;
  mimeTypes: readonly string[];
  extension: string;
  matches: (buffer: Buffer) => boolean;
}

const MEGABYTE = 1024 * 1024;
const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');

const FILE_RULES: Record<FilePurpose, readonly FileRule[]> = {
  avatar: [
    {
      maxSize: 2 * MEGABYTE,
      mimeTypes: ['image/png'],
      extension: '.png',
      matches: (buffer) =>
        buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    },
    {
      maxSize: 2 * MEGABYTE,
      mimeTypes: ['image/jpeg'],
      extension: '.jpg',
      matches: (buffer) =>
        buffer.length >= 3 &&
        buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    },
    {
      maxSize: 2 * MEGABYTE,
      mimeTypes: ['image/webp'],
      extension: '.webp',
      matches: (buffer) =>
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP',
    },
  ],
  attachment: [
    {
      maxSize: 5 * MEGABYTE,
      mimeTypes: ['image/png'],
      extension: '.png',
      matches: (buffer) =>
        buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    },
    {
      maxSize: 5 * MEGABYTE,
      mimeTypes: ['image/jpeg'],
      extension: '.jpg',
      matches: (buffer) =>
        buffer.length >= 3 &&
        buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    },
    {
      maxSize: 5 * MEGABYTE,
      mimeTypes: ['application/pdf'],
      extension: '.pdf',
      matches: (buffer) =>
        buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46])),
    },
  ],
  delivery: [
    {
      maxSize: 20 * MEGABYTE,
      mimeTypes: ['application/pdf'],
      extension: '.pdf',
      matches: (buffer) =>
        buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46])),
    },
    {
      maxSize: 20 * MEGABYTE,
      mimeTypes: ['application/zip'],
      extension: '.zip',
      matches: (buffer) =>
        buffer.length >= 4 &&
        buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    },
  ],
};

@Injectable()
export class FilesService {
  async save(
    file: MemoryFile,
    purpose: FilePurpose,
  ): Promise<string> {
    const rule = this.findMatchingRule(file, purpose);
    const folder = resolve(UPLOADS_ROOT, purpose);
    await fs.mkdir(folder, { recursive: true });

    const filename = `${randomUUID()}${rule.extension}`;
    const absolutePath = resolve(folder, filename);
    await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });

    return relative(process.cwd(), absolutePath);
  }

  async delete(storedPath: string): Promise<void> {
    const absolutePath = this.resolveStoredPath(storedPath);
    await fs.rm(absolutePath, { force: true });
  }

  async read(storedPath: string): Promise<Buffer> {
    return readFile(this.resolveStoredPath(storedPath));
  }

  private findMatchingRule(
    file: MemoryFile,
    purpose: FilePurpose,
  ): FileRule {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('A file is required');
    }

    const rules = FILE_RULES[purpose];
    if (!rules) {
      throw new BadRequestException('Invalid file purpose');
    }

    const rule = rules.find(
      (candidate) =>
        candidate.mimeTypes.includes(file.mimetype) &&
        candidate.matches(file.buffer),
    );

    if (!rule) {
      throw new UnsupportedMediaTypeException(
        `Unsupported ${purpose} file type`,
      );
    }

    if (file.size > rule.maxSize) {
      throw new BadRequestException(
        `${purpose} file must not exceed ${rule.maxSize / MEGABYTE} MB`,
      );
    }

    return rule;
  }

  private resolveStoredPath(storedPath: string): string {
    if (isAbsolute(storedPath)) {
      throw new BadRequestException('Invalid stored file path');
    }

    const absolutePath = resolve(process.cwd(), storedPath);
    const relativePath = relative(UPLOADS_ROOT, absolutePath);
    if (
      relativePath.startsWith('..') ||
      isAbsolute(relativePath) ||
      relativePath === ''
    ) {
      throw new BadRequestException('Invalid stored file path');
    }

    return absolutePath;
  }
}
