import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const URL_FIRMADA_EXPIRA_SEGUNDOS = 3600;

@Injectable()
export class StorageService {
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async guardarImagen(
    buffer: Buffer,
    tipo: 'dni' | 'selfie' | 'evidencia',
    userId: string,
  ): Promise<string> {
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

  // El bucket es privado, así que la app necesita una URL firmada (temporal)
  // para poder mostrar la imagen — la key sola (s3_key) no es accesible.
  async obtenerUrlFirmada(key: string): Promise<string> {
    const comando = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });

    return getSignedUrl(this.s3, comando, {
      expiresIn: URL_FIRMADA_EXPIRA_SEGUNDOS,
    });
  }
}
