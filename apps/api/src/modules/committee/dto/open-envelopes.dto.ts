import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// 2026-08-22: openEnvelopes took `@Body() body: { remarks?: string } = {}` — no
// DTO, no validation, and no request-body schema in the OpenAPI document. Opening
// with an empty body returned 201 and opened both envelopes.
//
// This is the most regulated action in the system. Quorum, chair presence and
// `committee:open_commercial` were all enforced correctly; the only thing missing
// was the *reason*, on the one action where the reason is the point. The committee
// UI already required remarks before enabling the button, so — as with approve —
// the control lived in the browser and not in the API.
//
// Minimum 20 characters matches Cancel / Suspend / Revert / award justification.

export class OpenEnvelopesDto {
  @ApiProperty({
    description:
      'Committee remarks recorded against the opening. Written to the CRITICAL audit entry and the opening record.',
    minLength: 20,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  remarks: string;
}
