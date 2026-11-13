
import { Page, BrowserContext } from '@playwright/test';

export async function seedLogin(page: Page, context: BrowserContext) {

// for sdm stage it dosent give all cookies when you login fully go to sdstage then enter email and you will get all
// cookies in the application coppy that only 
// await context.addCookies([
//   {
//     name: "_ga",
//     value: "GA1.2.1728058440.1773071621",
//     domain: ".bdpsmart.com",
//     path: "/",
//     expires: 1815462482,
//     httpOnly: false,
//     secure: false,
//     sameSite: "Lax"
//   },
//   {
//     name: "_ga_T61M16SLF5",
//     value: "GS2.2.s1780902423$o121$g1$t1780902485$j58$l0$h0",
//     domain: ".bdpsmart.com",
//     path: "/",
//     expires: 1815462485,
//     httpOnly: false,
//     secure: false,
//     sameSite: "Lax"
//   },
//   {
//     name: "_gid",
//     value: "GA1.2.1439922375.1780902423",
//     domain: ".bdpsmart.com",
//     path: "/",
//     expires: 1780988882,
//     httpOnly: false,
//     secure: false,
//     sameSite: "Lax"
//   },
//   {
//     name: "auth0",
//     value: "s%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQFMuvmZnkl8QLO-0kR45MO1sOpqwm7v6BUI80RxwUOnLfL-k3lBxR2_QH5SGe-hEHMstRsjsgE3XiG4__gFplU2mY29va2llg6dleHBpcmVz1_9f2CIAaipxr65vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJLZIG5ZUDl6dElndFVrSGlJdGtHV1dxRWJHeVBZWWI0MXVo2SBsUk5TdkZEbk83MHh1LWItNmpKYnRMLUVNTHFxNmo4cw.xkiw8jueb%2FDJJwqHZLUwlEaqFa8kcA3dwm2wBh%2FD6Lg",
//     domain: "testlogin.bdpsmart.com",
//     path: "/",
//     expires: 1781166510,
//     httpOnly: true,
//     secure: true,
//     sameSite: "None"
//   },
//   {
//     name: "auth0_compat",
//     value: "s%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQFMuvmZnkl8QLO-0kR45MO1sOpqwm7v6BUI80RxwUOnLfL-k3lBxR2_QH5SGe-hEHMstRsjsgE3XiG4__gFplU2mY29va2llg6dleHBpcmVz1_9f2CIAaipxr65vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJLZIG5ZUDl6dElndFVrSGlJdGtHV1dxRWJHeVBZWWI0MXVo2SBsUk5TdkZEbk83MHh1LWItNmpKYnRMLUVNTHFxNmo4cw.xkiw8jueb%2FDJJwqHZLUwlEaqFa8kcA3dwm2wBh%2FD6Lg",
//     domain: "testlogin.bdpsmart.com",
//     path: "/",
//     expires: 1781166510,
//     httpOnly: true,
//     secure: true,
//     sameSite: "Lax"
//   },
//   {
//     name: "auth0-mf",
//     value: "lzLYygYxYxl_OE1pQjJZyg.eDsqZanfKMOkdfAEGxYk3DJHyePeJvinSiD-NKsvtpuy3FfDhfYRPnMhr7lylkQXd0JOvxYIkM8ICL3sMrx2_JS_UF4bXWZEVF9qj0FG2Fra_8zCGQIRs7KTGLksz9hTMEyBRd4ShHCmnlYctOAj17ocu7N_hVCWgp7JErpnTyVHShnKBEGiAZ1HKLKVgHo6VB_SeDDGtgCV1AnL7fJbw0G7pmvgTax0B2sGrib2ygc.1779102821607.2592000000.KdqVk0LkZYy_b1wC1YgZeGd8XetYIoFZN3L_C29rUTI",
//     domain: "testlogin.bdpsmart.com",
//     path: "/",
//     expires: 1781511425,
//     httpOnly: true,
//     secure: true,
//     sameSite: "None"
//   },
//   {
//     name: "auth0-mf_compat",
//     value: "lzLYygYxYxl_OE1pQjJZyg.eDsqZanfKMOkdfAEGxYk3DJHyePeJvinSiD-NKsvtpuy3FfDhfYRPnMhr7lylkQXd0JOvxYIkM8ICL3sMrx2_JS_UF4bXWZEVF9qj0FG2Fra_8zCGQIRs7KTGLksz9hTMEyBRd4ShHCmnlYctOAj17ocu7N_hVCWgp7JErpnTyVHShnKBEGiAZ1HKLKVgHo6VB_SeDDGtgCV1AnL7fJbw0G7pmvgTax0B2sGrib2ygc.1779102821607.2592000000.KdqVk0LkZYy_b1wC1YgZeGd8XetYIoFZN3L_C29rUTI",
//     domain: "testlogin.bdpsmart.com",
//     path: "/",
//     expires: 1781511425,
//     httpOnly: true,
//     secure: true,
//     sameSite: "Lax"
//   },
//   {
//     name: "did",
//     value: "s%3Av0%3Af68b3035-cc77-42c5-8759-4f397e2de09b%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e%3Aad77647b1dceb0efd93949443f3ef0e93745c4941b4431d1a6e2bcac61fe67a9%3Ae4bac0febf9b7efa6b298378cf693ac91b80b9c949a36ce03667c3afa99ad436%3A46f15fb8eb608d0162f975474a8ad5470ac3de79c08eacb8ac046b0e2911aad9.1qhWDGeLECFNUDbdPCHRYtZCDS5Sd8ZojAMWw6Wui0s",
//     domain: "testlogin.bdpsmart.com",
//     path: "/",
//     expires: 1812464224,
//     httpOnly: true,
//     secure: true,
//     sameSite: "None"
//   },
//   {
//     name: "did_compat",
//     value: "s%3Av0%3Af68b3035-cc77-42c5-8759-4f397e2de09b%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e%3Aad77647b1dceb0efd93949443f3ef0e93745c4941b4431d1a6e2bcac61fe67a9%3Ae4bac0febf9b7efa6b298378cf693ac91b80b9c949a36ce03667c3afa99ad436%3A46f15fb8eb608d0162f975474a8ad5470ac3de79c08eacb8ac046b0e2911aad9.1qhWDGeLECFNUDbdPCHRYtZCDS5Sd8ZojAMWw6Wui0s",
//     domain: "testlogin.bdpsmart.com",
//     path: "/",
//     expires: 1812464224,
//     httpOnly: true,
//     secure: true,
//     sameSite: "Lax"
//   }
// ]);

await context.addCookies([
  {
    name: '_ga',
    value: 'GA1.2.1835191247.1785148366',
    domain: '.bdpsmart.com',
    path: '/',
    expires: 1828261052,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax'
  },
  {
    name: '_ga_T61M16SLF5',
    value: 'GS2.2.s1793701044$o16$g1$t1793701052$j52$l0$h0',
    domain: '.bdpsmart.com',
    path: '/',
    expires: 1828261052,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax'
  },
  {
    name: 'auth0',
    value: 's%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQCyTa57isnxCVZmgmI9Dfn6BIo7QL_xTpJG1RRKyLac_9koqWEFirZKzr5yMbhDbNssa6xLt49jxYx1ve0c9EyOmY29va2llg6dleHBpcmVz1_9pJIEAau9s5q5vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJHZIHVxdG10N0NaRHh1Q3lwRDVqUWxyblZKMllFRXZvaEUx.LHQ8GhmLMUUI8mee14n3vPedJrlAas3nZCNVPwY8DHg',
    domain: 'testlogin.bdpsmart.com',
    path: '/',
    expires: 1794075878,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: 'auth0_compat',
    value: 's%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQCyTa57isnxCVZmgmI9Dfn6BIo7QL_xTpJG1RRKyLac_9koqWEFirZKzr5yMbhDbNssa6xLt49jxYx1ve0c9EyOmY29va2llg6dleHBpcmVz1_9pJIEAau9s5q5vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJHZIHVxdG10N0NaRHh1Q3lwRDVqUWxyblZKMllFRXZvaEUx.LHQ8GhmLMUUI8mee14n3vPedJrlAas3nZCNVPwY8DHg',
    domain: 'testlogin.bdpsmart.com',
    path: '/',
    expires: 1794075878,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax'
  },
  {
    name: 'auth0-mfa-v2',
    value: 's%3Amfa-enc-v1.jllWKKWLsPG-oQXJ671Qnnv90yKwzz9brez-08kqGDh9kVrcM3kCCAbrv-Rls2uZ945wwDIY8aiGCNL9qb5itN6va11XMMsGBzxtmubOH244gbXMs8j6HE6uCvCXHXpszckCh3OdpDUHTYOvFKgEGOKux8AJ1ToJ1WLebW2WudJwAkqF6r7KmSKty4wlJACZloJaF0BJURZS4F1MMIw9PtB4ny905LWoau1Li_MLc75C4HnL_eibhq4oRbDagBj6fhyui9MbHx2vs6M-o4HUx5F0dpDh.VPb1iNPie0f9jXluSim9Q%2F8By7CeQgSFGypYFEPqBHw',
    domain: 'testlogin.bdpsmart.com',
    path: '/',
    expires: 1794421433,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: 'auth0-mfa-v2_compat',
    value: 's%3Amfa-enc-v1.jllWKKWLsPG-oQXJ671Qnnv90yKwzz9brez-08kqGDh9kVrcM3kCCAbrv-Rls2uZ945wwDIY8aiGCNL9qb5itN6va11XMMsGBzxtmubOH244gbXMs8j6HE6uCvCXHXpszckCh3OdpDUHTYOvFKgEGOKux8AJ1ToJ1WLebW2WudJwAkqF6r7KmSKty4wlJACZloJaF0BJURZS4F1MMIw9PtB4ny905LWoau1Li_MLc75C4HnL_eibhq4oRbDagBj6fhyui9MbHx2vs6M-o4HUx5F0dpDh.VPb1iNPie0f9jXluSim9Q%2F8By7CeQgSFGypYFEPqBHw',
    domain: 'testlogin.bdpsmart.com',
    path: '/',
    expires: 1794421433,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax'
  },
  {
    name: 'did',
    value: 's%3Av0%3A8cc9018f-724a-45e4-9295-d6124bcf69bf%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e.1SHlmt6yBBdhgRO8Y9EHTuRAYkLIxTEUd7k3mg52PiQ',
    domain: 'testlogin.bdpsmart.com',
    path: '/',
    expires: 1825374219,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  {
    name: 'did_compat',
    value: 's%3Av0%3A8cc9018f-724a-45e4-9295-d6124bcf69bf%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e.1SHlmt6yBBdhgRO8Y9EHTuRAYkLIxTEUd7k3mg52PiQ',
    domain: 'testlogin.bdpsmart.com',
    path: '/',
    expires: 1825374219,
    httpOnly: false,
    secure: true,
    sameSite: 'Lax'
  }
]);
  const navStart = Date.now();

  // await page.goto("https://hubtest.bdpsmart.com/");
  await page.goto("https://sdmstage.bdpsmart.com")

  await page.getByRole('textbox', { name: 'Email address' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('abhishek.ranjan@bdpint.com');
// await page.getByRole('textbox', { name: 'Email address' }).fill('rudraksh.sharma@psabdp.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('textbox', { name: 'Password' }).click();

   await page.getByRole('textbox', { name: 'Password' }).fill('TestApp$@123456788');

  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForLoadState('networkidle');
}