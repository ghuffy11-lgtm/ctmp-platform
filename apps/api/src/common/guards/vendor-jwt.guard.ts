import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class VendorJwtAuthGuard extends AuthGuard('vendor-jwt') {}
