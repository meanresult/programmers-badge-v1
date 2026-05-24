import { HttpService } from '@nestjs/axios';
import { Injectable, Logger as LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { UserData } from '../interface/programmers.interface';

@Injectable()
export class ProgrammersService {
  private readonly PROGRAMMERS_BASE_URL: string;
  private readonly PROGRAMMERS_SIGN_IN_PAGE_URL: string;
  private readonly PROGRAMMERS_SIGN_IN_URL: string;
  private readonly PROGRAMMERS_RECORD_URL: string;
  private readonly PROGRAMMERS_ID: string;
  private readonly PROGRAMMERS_PW: string;
  private readonly PROGRAMMERS_USER_AGENT: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.PROGRAMMERS_BASE_URL = 'https://programmers.co.kr';
    this.PROGRAMMERS_SIGN_IN_PAGE_URL =
      'https://programmers.co.kr/account/sign_in';
    this.PROGRAMMERS_SIGN_IN_URL =
      'https://programmers.co.kr/api/v1/account/sign-in';
    this.PROGRAMMERS_RECORD_URL =
      'https://programmers.co.kr/api/v1/users/record';
    this.PROGRAMMERS_ID =
      this.configService.get<string>('PROGRAMMERS_ID') || '';
    this.PROGRAMMERS_PW =
      this.configService.get<string>('PROGRAMMERS_PW') || '';
    this.PROGRAMMERS_USER_AGENT =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
  }

  private extractCookieHeader(setCookies: string[] = []): string {
    return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  private mergeCookieHeaders(...cookieSets: Array<string[] | undefined>): string {
    const cookieMap = new Map<string, string>();

    for (const setCookies of cookieSets) {
      for (const rawCookie of setCookies || []) {
        const cookiePair = rawCookie.split(';')[0];
        const separatorIndex = cookiePair.indexOf('=');

        if (separatorIndex < 1) {
          continue;
        }

        const name = cookiePair.slice(0, separatorIndex);
        cookieMap.set(name, cookiePair);
      }
    }

    return Array.from(cookieMap.values()).join('; ');
  }

  private getDefaultHeaders(referer?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'User-Agent': this.PROGRAMMERS_USER_AGENT,
      Origin: this.PROGRAMMERS_BASE_URL,
    };

    if (referer) {
      headers.Referer = referer;
    }

    return headers;
  }

  private async bootstrapSignInSession(): Promise<{
    cookies: string[];
    csrfToken?: string;
  }> {
    const response = await this.httpService.axiosRef.get<string>(
      this.PROGRAMMERS_SIGN_IN_PAGE_URL,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': this.PROGRAMMERS_USER_AGENT,
        },
      },
    );

    const csrfTokenMatch = response.data.match(
      /<meta name="csrf-token" content="([^"]+)"/,
    );

    return {
      cookies: response.headers['set-cookie'] || [],
      csrfToken: csrfTokenMatch?.[1],
    };
  }

  private getAxiosErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const responseData =
        typeof error.response?.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response?.data);

      return `status=${status ?? 'unknown'} body=${responseData ?? 'undefined'}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  /**
   * 프로그래머스 로그인 메소드
   * @description 프로그래머스 로그인 API 요청의 응답값 중 쿠키를 추출하여 문자열 배열 형태로 반환합니다.
   * @function signInProgrammers
   * @returns {Promise<string[]>}
   */
  async signInProgrammers(): Promise<string[]> {
    try {
      const bootstrapSession = await this.bootstrapSignInSession();
      const response = await this.httpService.axiosRef.post(
        this.PROGRAMMERS_SIGN_IN_URL,
        { user: { email: this.PROGRAMMERS_ID, password: this.PROGRAMMERS_PW } },
        {
          headers: {
            ...this.getDefaultHeaders(this.PROGRAMMERS_SIGN_IN_PAGE_URL),
            Cookie: this.extractCookieHeader(bootstrapSession.cookies),
            ...(bootstrapSession.csrfToken
              ? { 'X-CSRF-Token': bootstrapSession.csrfToken }
              : {}),
          },
        },
      );

      this.loggerService.log(
        `✅ Sign in success Programmers (ID: ${this.PROGRAMMERS_ID})`,
      );

      return [
        ...bootstrapSession.cookies,
        ...(response.headers['set-cookie'] || []),
      ];
    } catch (error) {
      this.loggerService.error(
        `❌ Sign in fail Programmers (ID: ${this.PROGRAMMERS_ID}), ${this.getAxiosErrorMessage(error)}`,
      );

      throw error;
    }
  }

  /**
   * 프로그래머스 유저 정보 조회 메소드
   * @description 프로그래머스 유저 정보 조회 API를 헤더에 인증 쿠키를 담아 호출하여 유저 정보를 반환합니다.
   * @function getProgrammersRecordInfo
   * @returns {Promise<UserData>}
   */
  async getProgrammersRecordInfo(): Promise<UserData> {
    const cookie: string[] = await this.signInProgrammers();

    try {
      const response = await this.httpService.axiosRef.get(
        this.PROGRAMMERS_RECORD_URL,
        {
          headers: {
            ...this.getDefaultHeaders(this.PROGRAMMERS_SIGN_IN_PAGE_URL),
            Cookie: this.mergeCookieHeaders(cookie),
          },
        },
      );

      this.loggerService.log(
        `✅ Data fetching success (ID: ${this.PROGRAMMERS_ID})`,
      );

      return response.data;
    } catch (error) {
      this.loggerService.error(
        `❌ Data fetching fail. ${this.getAxiosErrorMessage(error)}`,
      );

      throw error;
    }
  }
}
