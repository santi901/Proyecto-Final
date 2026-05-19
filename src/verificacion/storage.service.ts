import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {

  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async guardarImagen(buffer: Buffer, tipo: 'dni' | 'selfie', userId: string): Promise<string> {
    const nombreArchivo = `${userId}/${tipo}-${uuidv4()}.jpg`;

    const comando = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: nombreArchivo,
      Body: buffer,
      ContentType: 'image/jpeg',
    });

    await this.s3.send(comando);

    return nombreArchivo;
  }
}