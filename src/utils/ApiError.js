class ApiError extends Error{
  constructor(
    statusCode,
    message = "Something went wrong",
    errors = [],
    stack = ''
  ){
    super(message)
    this.statusCode = statusCode
    this.data = null
    this.message = false;
    this.errors = this.errors

    if(stack){
      this.stack = stack
    }else{
      error.captureStack(this, this.constructor)
    }

  }
} 

export {ApiError}