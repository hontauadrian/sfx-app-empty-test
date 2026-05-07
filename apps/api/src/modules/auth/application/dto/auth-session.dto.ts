import { ApiProperty } from '@nestjs/swagger';

export class AuthSessionDto {
  @ApiProperty({ type: Boolean })
  isAuthenticated!: boolean;

  @ApiProperty({ type: String })
  subject!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: [String] })
  roles!: string[];
}
