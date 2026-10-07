import VideoIdeasBoard from '../components/VideoIdeas'

// /ideas: the 50k+ videos, for every member. The same board sits inside the VIP page as its "Video ideas" section.
export default function VideoIdeas() {
  return (
    <div className="page">
      <VideoIdeasBoard />
    </div>
  )
}
