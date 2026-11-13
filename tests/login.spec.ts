import { test, expect } from '@playwright/test';

test('test', async ({ page, context }) => {

//   // Inject cookies BEFORE test navigation to test 
//   await context.addCookies( [
//   {
//     name: '_ga',
//     value: 'GA1.2.1800544251.1772099921',
//     domain: '.bdpsmart.com',
//     path: '/',
//     expires: 1806660778,
//     httpOnly: false,
//     secure: false,
//     sameSite: 'Lax'
//   },
//   {
//     name: '_ga_T61M16SLF5',
//     value: 'GS2.2.s1772099920$o1$g1$t1772100778$j60$l0$h0',
//     domain: '.bdpsmart.com',
//     path: '/',
//     expires: 1806660778,
//     httpOnly: false,
//     secure: false,
//     sameSite: 'Lax'
//   },
//   {
//     name: '_gid',
//     value: 'GA1.2.1563347086.1772099921',
//     domain: '.bdpsmart.com',
//     path: '/',
//     expires: 1772187178,
//     httpOnly: false,
//     secure: false,
//     sameSite: 'Lax'
//   },
//   {
//     name: 'auth0',
//     value: 's%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQFaeq-z993msCtQvwVkHf3WkvGWaAFMs8lODrnvDk3ur-MoODBF7iA9_fq5wVNvOw2NjkVitdPaGIwfj3n6RLVOmY29va2llg6dleHBpcmVz1_95l-4AaaQRK65vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJLZIE5WbE5wWHhrRWV3M0UxY1otaTVqeHpfU2ZnVktiNEJF2SBHVWcyQzB1R1RveW5pcERVMXVVV1pVMmF6U2tGWWZXVw.r7j4CrJi%2BuGTAe0n62MXqGCJ62Dn0oXLtdV%2B9yGWjfk',
//     domain: 'testlogin.bdpsmart.com',
//     path: '/',
//     expires: 1772369578,
//     httpOnly: true,
//     secure: true,
//     sameSite: 'None'
//   },
//   {
//     name: 'auth0-mf',
//     value: 'q3nmkw4X2LoUeHJP7et-fQ.fCTA2z3MffyKhstPFcMlgQJaiY4ovdI3dUPNOn3zFIS67L9fV0a1YRPpezPHgczSMPZHDPw4woZn6gtlcDwNaNa6SmUCzf4NL5E9FjyTBzYfni8ou4GaPHK2xaJlPqTR2oK-zfks3X5diqHpwSSozKwlA3ZMsVlxldd3s425FdrGpYS4ra7EB_SGR8QIxvVVHsYY7Bus7XwE_UPISEipmA.1772099990871.2592000000.fSrv7BHWKuhGYKDBIV5suXRwqqhcEnSlTNUQDiUbxso',
//     domain: 'testlogin.bdpsmart.com',
//     path: '/',
//     expires: 1772714758,
//     httpOnly: true,
//     secure: true,
//     sameSite: 'None'
//   },
//   {
//     name: 'auth0-mf_compat',
//     value: 'q3nmkw4X2LoUeHJP7et-fQ.fCTA2z3MffyKhstPFcMlgQJaiY4ovdI3dUPNOn3zFIS67L9fV0a1YRPpezPHgczSMPZHDPw4woZn6gtlcDwNaNa6SmUCzf4NL5E9FjyTBzYfni8ou4GaPHK2xaJlPqTR2oK-zfks3X5diqHpwSSozKwlA3ZMsVlxldd3s425FdrGpYS4ra7EB_SGR8QIxvVVHsYY7Bus7XwE_UPISEipmA.1772099990871.2592000000.fSrv7BHWKuhGYKDBIV5suXRwqqhcEnSlTNUQDiUbxso',
//     domain: 'testlogin.bdpsmart.com',
//     path: '/',
//     expires: 1772714758,
//     httpOnly: true,
//     secure: true,
//     sameSite: 'Lax'
//   },
//   {
//     name: 'auth0_compat',
//     value: 's%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQFaeq-z993msCtQvwVkHf3WkvGWaAFMs8lODrnvDk3ur-MoODBF7iA9_fq5wVNvOw2NjkVitdPaGIwfj3n6RLVOmY29va2llg6dleHBpcmVz1_95l-4AaaQRK65vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJLZIE5WbE5wWHhrRWV3M0UxY1otaTVqeHpfU2ZnVktiNEJF2SBHVWcyQzB1R1RveW5pcERVMXVVV1pVMmF6U2tGWWZXVw.r7j4CrJi%2BuGTAe0n62MXqGCJ62Dn0oXLtdV%2B9yGWjfk',
//     domain: 'testlogin.bdpsmart.com',
//     path: '/',
//     expires: 1772369578,
//     httpOnly: true,
//     secure: true,
//     sameSite: 'Lax'
//   },
//   {
//     name: 'did',
//     value: 's%3Av0%3A1fe6cdce-2a1f-4cf6-a052-9d018f563974%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e%3A80418fceff34553da120df38f326a3984cf9a058f61bc57616f45aa12f8346f0.v80Ixc%2FZCmiB7vQmJW42BUldmaihEu9FKrKXqx9Rk8E',
//     domain: 'testlogin.bdpsmart.com',
//     path: '/',
//     expires: 1803446544,
//     httpOnly: true,
//     secure: true,
//     sameSite: 'None'
//   },
//   {
//     name: 'did_compat',
//     value: 's%3Av0%3A4907489f-5bee-45f4-a221-8d77f9c60f1b%3A80418fceff34553da120df38f326a3984cf9a058f61bc57616f45aa12f8346f0%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e%3A46f15fb8eb608d0162f975474a8ad5470ac3de79c08eacb8ac046b0e2911aad9.C9J6adVBP5vdZ5CseHR9FQvYxeIRZDkyL%2FGszq8jAH0',
//     domain: 'testlogin.bdpsmart.com',
//     path: '/',
//     expires: 1802846478,
//     httpOnly: true,
//     secure: true,
//     sameSite: 'Lax'
//   }
// ]);

// this is for stage of itt 

await context.addCookies([
 {
  name: '_ga',
  value: 'GA1.2.1835191247.1785148366',
  domain: '.bdpsmart.com',
  path: '/',
  expires: 1812392238,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax'
},
{
  name: '_ga_T61M16SLF5',
  value: 'GS2.2.s1788421013$o11$g1$t1788421038$j35$l0$h0',
  domain: '.bdpsmart.com',
  path: '/',
  expires: 1812392238,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax'
},
{
  name: '_gid',
  value: 'GA1.2.1205657154.1788374442',
  domain: '.bdpsmart.com',
  path: '/',
  expires: 1788507438,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax'
},
{
  name: 'auth0',
  value: 's%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQHgfIbSt0NN7g1l7OOcFo01w5u1doVmvVTqL6-iLAkOmuWnNz4IJuydz-iPhk7Dzvg47GbRo4KWbYnby5oJFgY6mY29va2llg6dleHBpcmVz1_-fgIUAap1Ozq5vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJHZIDFCdWVrSVgwbjQ1RG0yYVA1dS11MXNxQTYxMUswMk9P.04v3fgfWGw7F2Mk%2FgHf1x1dBwWb20fpmQJ6dB%2BpDUbs',
  domain: 'testlogin.bdpsmart.com',
  path: '/',
  expires: 1788694222,
  httpOnly: true,
  secure: true,
  sameSite: 'None'
},
{
  name: 'auth0_compat',
  value: 's%3Av1.gadzZXNzaW9ug6ZoYW5kbGXEQHgfIbSt0NN7g1l7OOcFo01w5u1doVmvVTqL6-iLAkOmuWnNz4IJuydz-iPhk7Dzvg47GbRo4KWbYnby5oJFgY6mY29va2llg6dleHBpcmVz1_-fgIUAap1Ozq5vcmlnaW5hbE1heEFnZc4PcxQAqHNhbWVTaXRlpG5vbmWkc2JpZJHZIDFCdWVrSVgwbjQ1RG0yYVA1dS11MXNxQTYxMUswMk9P.04v3fgfWGw7F2Mk%2FgHf1x1dBwWb20fpmQJ6dB%2BpDUbs',
  domain: 'testlogin.bdpsmart.com',
  path: '/',
  expires: 1788694222,
  httpOnly: true,
  secure: true,
  sameSite: 'Lax'
},
{
  name: 'auth0-mf',
  value: 'DmbdtCSjb6qrmi8TTEeqLQ.V0SU-iZaSjubfGMSv35LNd6xwih43dPpf7USEqaAU-Ybuo1BdVOH5CciiMoxi0jSfrtRd5xZSEgIZEolZ2GYlMPcrt32u0hDD-LstN_dqLZ15KyW_2E89pBEKywkWX6SuWbTY9RKz5CMo3FsLQ_53w.1787548607007.2592000000.0wikpAwq3KXDyHy-PKD6tewpypdg5dpQ7BiGW_yyVtI',
  domain: 'testlogin.bdpsmart.com',
  path: '/',
  expires: 1789038816,
  httpOnly: true,
  secure: true,
  sameSite: 'None'
},
{
  name: 'auth0-mf_compat',
  value: 'DmbdtCSjb6qrmi8TTEeqLQ.V0SU-iZaSjubfGMSv35LNd6xwih43dPpf7USEqaAU-Ybuo1BdVOH5CciiMoxi0jSfrtRd5xZSEgIZEolZ2GYlMPcrt32u0hDD-LstN_dqLZ15KyW_2E89pBEKywkWX6SuWbTY9RKz5CMo3FsLQ_53w.1787548607007.2592000000.0wikpAwq3KXDyHy-PKD6tewpypdg5dpQ7BiGW_yyVtI',
  domain: 'testlogin.bdpsmart.com',
  path: '/',
  expires: 1789038816,
  httpOnly: true,
  secure: true,
  sameSite: 'Lax'
},
{
  name: 'did',
  value: 's%3Av0%3A8cc9018f-724a-45e4-9295-d6124bcf69bf%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e.1SHlmt6yBBdhgRO8Y9EHTuRAYkLIxTEUd7k3mg52PiQ',
  domain: 'testlogin.bdpsmart.com',
  path: '/',
  expires: 1810038815,
  httpOnly: true,
  secure: true,
  sameSite: 'None'
},
{
  name: 'did_compat',
  value: 's%3Av0%3A8cc9018f-724a-45e4-9295-d6124bcf69bf%3Acaef6ef4d6de2820125482903d7aad457e6b8fdc76c5af82d2c2e3fa7f51690e.1SHlmt6yBBdhgRO8Y9EHTuRAYkLIxTEUd7k3mg52PiQ',
  domain: 'testlogin.bdpsmart.com',
  path: '/',
  expires: 1810038815,
  httpOnly: true,
  secure: true,
  sameSite: 'Lax'
}
])


const navStart = Date.now();

  // await page.goto('https://testlogin.bdpsmart.com/u/login/identifier?state=hKFo2SBPOEo4MFlQc2p1M0hoekwzdXhoZWtrVUZlNlFKNzExV6Fur3VuaXZlcnNhbC1sb2dpbqN0aWTZIGh0MU5lSEVIc3BpaW1XMDlOMzl6cGdIbDVXdGNEd2pUo2NpZNkga3hvSlFDbFh4YkVjdkVZWDZIVllFbkVSSzR3d0FlQWM');
await page.goto('https://test.itt.bdpsmart.com/')
  await page.getByRole('textbox', { name: 'Email address' }).click();
  // await page.getByRole('textbox', { name: 'Email address' }).fill('abhishek.ranjan@bdpint.com');
 await page.getByRole('textbox', { name: 'Email address' }).fill('manasranjan.sahoo@bdpint.com');
 
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Password' }).click();
//  await page.getByRole('textbox', { name: 'Password' }).fill('TestApp$@12345678999');
 
//  await page.getByRole('textbox', { name: 'Password' }).fill('Cozo&Psabdp12345!@#$%!@#$%'); this is stage
 
 await page.getByRole('button', { name: 'Continue' }).click();
 await page.waitForLoadState('networkidle');

 
 
});
