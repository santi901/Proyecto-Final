import { Injectable } from '@nestjs/common';
import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';

@Injectable()
export class VerificacionService {

  private rekognition: RekognitionClient;

  constructor() {
    this.rekognition = new RekognitionClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async compararCaras(dniBuffer: Buffer, selfieBuffer: Buffer): Promise<{ coinciden: boolean; similitud: number }> {
    const comando = new CompareFacesCommand({
      SourceImage: { Bytes: dniBuffer },
      TargetImage: { Bytes: selfieBuffer },
      SimilarityThreshold: 80,
    });

    const respuesta = await this.rekognition.send(comando);
    const coincidencias = respuesta.FaceMatches ?? [];

    if (coincidencias.length === 0) {
      return { coinciden: false, similitud: 0 };
    }

    const similitud = coincidencias[0].Similarity ?? 0;
    return { coinciden: similitud >= 90, similitud };
  }
}