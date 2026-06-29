import { Injectable, BadRequestException } from '@nestjs/common';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';

@Injectable()
export class TextractService {

  private textract: TextractClient;

  constructor() {
    this.textract = new TextractClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async validarDni(dniBuffer: Buffer): Promise<void> {
    const comando = new DetectDocumentTextCommand({
      Document: { Bytes: dniBuffer },
    });

    let respuesta;
    try {
      respuesta = await this.textract.send(comando);
    } catch (error) {
      throw new BadRequestException('No se pudo leer el DNI. Asegurate de que la foto sea clara y esté bien iluminada.');
    }

    const textoDetectado = respuesta.Blocks
      ?.filter(block => block.BlockType === 'LINE')
      .map(block => block.Text?.toUpperCase() ?? '')
      .join(' ') ?? '';

    const palabrasClave = ['ARGENTINA', 'DOCUMENTO', 'DNI', 'IDENTIDAD', 'NACIONAL', 'TRAMITE'];
    const esDni = palabrasClave.some(palabra => textoDetectado.includes(palabra));

    if (!esDni) {
      throw new BadRequestException('La imagen del DNI no parece ser un documento válido. Por favor enviá una foto clara del frente de tu DNI.');
    }
  }
}