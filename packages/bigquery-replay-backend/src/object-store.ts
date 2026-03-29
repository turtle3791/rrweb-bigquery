import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Storage } from '@google-cloud/storage';

export interface ObjectStore {
  read(objectPath: string): Promise<Buffer>;
  write(objectPath: string, contents: Buffer): Promise<void>;
}

export class FileSystemObjectStore implements ObjectStore {
  constructor(private readonly rootDir: string) {}

  async read(objectPath: string): Promise<Buffer> {
    return readFile(resolve(this.rootDir, objectPath));
  }

  async write(objectPath: string, contents: Buffer): Promise<void> {
    const targetPath = resolve(this.rootDir, objectPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents);
  }
}

export class GoogleCloudStorageObjectStore implements ObjectStore {
  private readonly storage = new Storage();

  constructor(
    private readonly bucketName: string,
    private readonly prefix: string,
  ) {}

  async read(objectPath: string): Promise<Buffer> {
    const [contents] = await this.storage
      .bucket(this.bucketName)
      .file(this.resolvePath(objectPath))
      .download();
    return contents;
  }

  async write(objectPath: string, contents: Buffer): Promise<void> {
    await this.storage
      .bucket(this.bucketName)
      .file(this.resolvePath(objectPath))
      .save(contents, {
        resumable: false,
        contentType: 'application/json',
      });
  }

  private resolvePath(objectPath: string): string {
    return `${this.prefix.replace(/\/$/, '')}/${objectPath.replace(
      /^\/+/,
      '',
    )}`;
  }
}
