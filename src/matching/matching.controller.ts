import { Controller, Get, Query } from '@nestjs/common';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('trabajadores-disponibles')
  trabajadoresDisponibles(
    @Query('trabajoId') trabajoId: string,
    @Query('radioKm') radioKm?: string,
  ) {
    return this.matchingService.trabajadoresDisponibles(
      trabajoId,
      radioKm ? parseFloat(radioKm) : undefined,
    );
  }
}
