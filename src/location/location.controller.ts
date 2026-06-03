import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { LocationService, Job } from './location.service';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('update')
  actualizarUbicacion(@Body() body: { workerId: string; lat: number; lng: number }) {
    return this.locationService.actualizarUbicacion(body.workerId, body.lat, body.lng);
  }

  @Get('jobs-nearby')
  jobsCercanos(
    @Query('workerId') workerId: string,
    @Query('radioKm') radioKm: string,
    @Query('jobs') jobs: string,
  ) {
    const jobsParseados: Job[] = JSON.parse(jobs);
    return this.locationService.filtrarJobsCercanos(
      workerId,
      parseFloat(radioKm),
      jobsParseados,
    );
  }
}