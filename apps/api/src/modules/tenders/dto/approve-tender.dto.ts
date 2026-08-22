import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// 2026-08-22: approve/reject took `@Body('comments')` and `@Body('reason')` as
// bare strings with no DTO, so the API accepted an empty body and returned 201.
// The admin UI has always blocked empty text ("Comments are required for audit
// compliance"), which is why this read as a working control — the check existed
// in the browser only, and any direct API call walked past it. The audit row for
// such an approval records `{"status":"APPROVED"}` and no rationale at all.
//
// Minimum 20 characters matches the house convention for audit free-text on a
// regulated state change: Cancel, Suspend, Revert and the award justification
// (BUG-149) all use MinLength(20).

export class ApproveTenderDto {
  @ApiProperty({
    description: 'Why the tender is being approved. Written to the audit trail.',
    minLength: 20,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  comments: string;
}

export class RejectTenderDto {
  @ApiProperty({
    description: 'Why the tender is being rejected. Written to the audit trail.',
    minLength: 20,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
