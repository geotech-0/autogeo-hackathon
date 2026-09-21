import { Component } from 'react';
import type { ReactNode } from 'react';
export default class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false}; static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){console.error('AutoGeo view error',error);}
 render(){return this.state.failed?<section className="panel empty-state"><h2>화면을 불러오지 못했습니다</h2><p>저장된 기록은 유지됩니다. 화면을 다시 열어주세요.</p><button className="btn btn-primary" onClick={()=>this.setState({failed:false})}>다시 시도</button></section>:this.props.children;}
}
