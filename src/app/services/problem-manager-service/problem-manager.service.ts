import { EventEmitter, Injectable } from '@angular/core';
import { Packets } from '../api-service/api.packets';
import { ApiService, Meta } from '../api-service/api.service';


export class RawMap extends Map<string, Meta>{};
export class ProblemList extends Array<ProblemDescriptor>{};
export class ProblemMap extends Map<string, ProblemDescriptor>{};
export class ServiceMap extends Map<string, ServiceDescriptor>{};
export class ParamsMap extends ServiceMap{};
export class ArgsMap extends Map<string, ArgDescriptor>{};
export class FilesMap extends Map<string, FileDescriptor>{};

export class ProblemDescriptor {
  public key;
  public services=new ServiceMap();
  
  constructor(
    public name:string, 
    meta:Meta,
    ){
      meta.services.forEach((service,serviceName)=>{
        let serviceDesc = new ServiceDescriptor(serviceName,service,this)
        this.services.set(serviceDesc.getKey(), serviceDesc)
      })
      this.key = this.getKey()
    }

    getKey(){
      let key = this.name.trim()
      key = key.toLowerCase()
      key = key.replace("_+","_")
      key = key.replace(" ","-")
      key = key.replace("-+","-")
      key = key.replace("[^a-z0-9_-]","")
      
      return key
    }
}

export class ServiceDescriptor {
  public key;
  public args = new ArgsMap();
  public evaluator;
  public files = new FilesMap();
  public filesOrder
  constructor( public name:string, 
               service:Packets.Service,
               public parent:ProblemDescriptor,
    ){
      this.evaluator = service.evaluator
      
      this.filesOrder = service.files ?? []
      this.filesOrder.forEach(name =>{
        let file = new FileDescriptor(name,this)
        this.files.set(file.name,file)
      })
      service.args!.forEach((arg,argName)=>{
        //console.log('ServiceDescriptor:constructor:arg', arg)
        let argDesc = new ArgDescriptor(argName,arg,this)
        this.args.set(argName,argDesc)
      })
      console.log('ServiceDescriptor:constructor:args', this.args)
      this.key = this.getKey()
    }

    public getKey(){
      let key = this.name.trim()
      key = key.toLowerCase().trim()
      key = key.replace(" ","-")
      key = key.replace("[^a-z0-9_-]","")
      key = key.replace("-+","-")
      key = key.replace("_+","_")
      return this.parent.getKey() + "_" + key
    }

    public exportArgs(){
      let args:any = {}
      this.args.forEach(arg=>{
        args[arg.name]=arg.value
      })
      return args;
    }

    public exportFilesPaths(){
      let fileList = new Array<string>();
      this.filesOrder.forEach((name)=>{
        let file = this.files.get(name)
        let value = file?.value ?? ""
        fileList.push(value)
      })

      return fileList
    }
}

export class ArgDescriptor{
  public key;
  public default: string
  public regex: RegExp
  public value: string
  
  constructor(
    public name:string, 
    arg: Packets.Arg,
    public parent: ServiceDescriptor
    ){
    this.default = arg.default
    this.regex = arg.regex
    this.value = arg.default
    this.key = this.getKey()
  }

  getKey(){
    let key = this.name.trim()
    key = key.toLowerCase().trim()
    key = key.replace(" ","-")
    key = key.replace("[^a-z0-9_-]","")
    key = key.replace("-+","-")
    key = key.replace("_+","_")
    return this.parent.getKey() + "_" + key
  }
}

export class FileDescriptor{
  public key;
  public value:string=""; 

  constructor(
    public name:string, 
    public parent: ServiceDescriptor
    ){
    this.key = this.getKey()
  }

  getKey(){
    let key = this.name.trim()
    key = key.toLowerCase().trim()
    key = key.replace(" ","-")
    key = key.replace("[^a-z0-9_-]","")
    key = key.replace("-+","-")
    key = key.replace("_+","_")
    return this.parent.getKey() + "_" + key
  }
}




@Injectable({
  providedIn: 'root'
})
export class ProblemManagerService {
  selectedProblem?: ProblemDescriptor
  selectedService?: ServiceDescriptor

  problemList=new ProblemList();
  problems=new ProblemMap();
  services=new ServiceMap();
  savedParams=new ParamsMap();
  

  public onProblemsChanged = new EventEmitter<boolean>();
  public onError = new EventEmitter<any>();
    
  constructor(
    public api:ApiService
  ){}


  updateProblems(){
    this.selectedProblem=undefined;
    this.selectedService=undefined;
    this.problemList=[];
    this.problems.clear();
    this.services.clear();
    this.onProblemsChanged.emit(true)

    let req = this.api.problemList((problemMap) => {
      console.log('apiProblemList:problemList:', problemMap)
      problemMap.forEach(( problem, name )=>{
        let problemDesc = new ProblemDescriptor(name, problem)
        this.problemList.push(problemDesc)
        this.problems.set(problemDesc.key,problemDesc);
        problemDesc.services.forEach((serviceDesc)=>{
          this.services.set(serviceDesc.key, serviceDesc)
        })
      })
      this.onProblemsChanged.emit(false)
    });
    req.onError = (error) => { 
      this.onProblemsChanged.emit(false)
      this.onError.emit(error) 
    };
  }

  
  
  selectProblem(selectedProblem: ProblemDescriptor){
    this.selectedProblem = selectedProblem;
    this.selectedService = undefined
  }
  

  selectService(selectedService: ServiceDescriptor){
    let name = selectedService.key;
    if ( this.savedParams.has(name) ){
      //TODO: Deep copy param values from  to selectedProblem object, to account for changes in the problem structure.
      this.selectedService = this.savedParams.get(name)
    }else{
      this.savedParams.set(name,selectedService);
      this.selectedService = selectedService;
    }
  }


  validateArgs(service: ServiceDescriptor){
    let issues = new Map<string,any>();
    service.args.forEach((arg)=>{
      let issue = this.validateArg(arg)
      if(issue){issues.set(arg.key,issue)}
    })
    return issues;
  }

  validateArg(arg: ArgDescriptor){
      //set
      if (arg.regex === null){
        console.log("validateArg:regex:null")
        return null
      }

      //valid re
      let pattern;
      try{
        pattern = new RegExp(arg.regex)
      }catch(error:any) { 
        console.log("validateArg:regex:invalid")
        return null;
      }

      //match
      let match = arg.value.match(pattern)
      console.log("validateArg:value:",arg.value)
      console.log("validateArg:pattern:",pattern)
      console.log("validateArg:match:",match)
      if(!match || match.length == 0){
        console.log("validateArg:match:no")
        return arg.name + ": Validation error";
      }
      console.log("validateArg:match:yes")
      return null;
  }

}
