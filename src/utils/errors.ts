// import { ErrorResponse } from '../interfaces';

// export const handleError = (error: any): ErrorResponse => {
//   const status = error.status;

//   //   return {
//   //     isError: true,
//   //     content: [{ type: 'text', text: `Error: ${error.message}` }],
//   //   };
//   const resource = 'user';
//   const id = 'xxx-1234';
//   return {
//     statusCode: 404,
//     body: {
//       error: {
//         code: 'RESOURCE_NOT_FOUND',
//         message: `The requested ${resource} with ID ${id} was not found.`,
//         details: { resource, id },
//       },
//     },
//   } as any;
// };
